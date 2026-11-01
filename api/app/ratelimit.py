"""A small in-memory token bucket per key (single uvicorn worker, API.md §10)."""

import threading
import time
from collections.abc import Callable


class RateLimiter:
    """Allow ``capacity`` events per ``period`` seconds per key, refilled continuously.

    Keys are hashed IPs, never raw ones. Buckets that have refilled completely
    carry no information, so they are dropped when the table grows.

    Parameters
    ----------
    capacity
        Burst size and number of events per period.
    period
        Seconds for a full refill.
    clock
        Monotonic clock, injectable for tests.

    Examples
    --------
    .. code-block:: python

        login_limit = RateLimiter(capacity=5, period=15 * 60)
        if not login_limit.allow(hashed_ip):
            ...  # answer 429
    """

    MAX_KEYS = 10_000

    def __init__(
        self, capacity: int, period: float, clock: Callable[[], float] = time.monotonic
    ) -> None:
        self.capacity = float(capacity)
        self.rate = capacity / period
        self.clock = clock
        self._buckets: dict[str, tuple[float, float]] = {}  # key -> (tokens, updated_at)
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        """Take one token for ``key``; False when the bucket is empty."""
        now = self.clock()
        with self._lock:
            tokens, updated_at = self._buckets.get(key, (self.capacity, now))
            tokens = min(self.capacity, tokens + (now - updated_at) * self.rate)
            allowed = tokens >= 1.0
            if allowed:
                tokens -= 1.0
            self._buckets[key] = (tokens, now)
            if len(self._buckets) > self.MAX_KEYS:
                self._drop_full(now)
            return allowed

    def retry_after(self, key: str) -> int:
        """Whole seconds until ``key`` has one token again (at least 1)."""
        tokens, _ = self._buckets.get(key, (self.capacity, self.clock()))
        return max(1, int((1.0 - tokens) / self.rate) + 1)

    def _drop_full(self, now: float) -> None:
        full_after = self.capacity / self.rate
        self._buckets = {
            key: value for key, value in self._buckets.items() if now - value[1] < full_after
        }
        if len(self._buckets) > self.MAX_KEYS // 2:
            # A wide flood: keep the most recently seen half, so this rebuild is rare.
            newest = sorted(self._buckets.items(), key=lambda kv: kv[1][1], reverse=True)
            self._buckets = dict(newest[: self.MAX_KEYS // 2])
