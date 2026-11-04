---
title: 'Example draft: plain Markdown'
dek: 'A hidden test post that uses only plain Markdown. It never publishes.'
date: 2026-10-29
tags: [Numerics]
# Test fixture for tests/e2e/dev/markdown-post.spec.ts.
# It must stay a draft: drafts render under `astro dev` only.
draft: true
hero:
  image: ../../assets/fig-mitosis-night.jpg
  imageDay: ../../assets/fig-mitosis-day.jpg
  alt: 'Gray–Scott spots, several of them splitting in two'
  caption: 'A hero image set in the front matter.'
---

A paragraph with inline math $D_u = 1$ and $\frac{a}{b} < c$, a [link](/), `inline code`, **bold** and _italic_. Plain Markdown also accepts a comparison such as a < b and braces such as {x}, which an MDX file would reject.

## An equation

$$
\frac{\partial u}{\partial t} = D_u \nabla^2 u - u v^2 + F (1 - u) \tag{1}
$$

## Code

```python title="step.py"
def step(u):
    return u + 1
```

## An image

![Spots and loops of a Gray–Scott field in amber and teal](../../assets/project-gray-scott.jpg)

## A table

The table is wide on purpose: on a phone it must scroll inside itself.

| Preset          | F     |     k | Diffusion of u | Diffusion of v | Time step | Grid size  |
| --------------- | ----- | ----: | -------------- | -------------- | --------- | ---------- |
| Mitosis         | 0.036 | 0.064 | 1.0            | 0.5            | 1.0       | 512 by 512 |
| Spots and loops | 0.018 | 0.051 | 1.0            | 0.5            | 1.0       | 512 by 512 |

### Lists and a quotation

- One
- Two

1. First
2. Second

> A quotation.

---

The last paragraph, after a rule.
