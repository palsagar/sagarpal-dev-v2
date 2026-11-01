// Gray–Scott reaction–diffusion on WebGL2 (DESIGN.md §5).
//
//   du/dt = Du ∇²u − u v² + F (1 − u)        Du = 1.0, Dv = 0.5, dt = 1
//   dv/dt = Dv ∇²v + u v² − (F + k) v        9-point Laplacian, periodic grid
//
// State (u in R, v in G) ping-pongs between two float textures. The brush is a
// segment uniform applied inside the step shader, so seeding needs no readback.
// The display pass upsamples v bilinearly and maps it through a 256×1 LUT.
import { FIELD_COLORMAPS, type FieldTheme } from './field-presets';

const VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const HEAD = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
uniform sampler2D uState;
`;

const STEP =
  HEAD +
  `uniform vec2 uFk;
uniform vec4 uBrush;
uniform float uRadius;
out vec4 outState;
vec2 at(ivec2 p, ivec2 n) { return texelFetch(uState, (p + n) % n, 0).xy; }
void main() {
  ivec2 n = textureSize(uState, 0);
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec2 c = at(p, n);
  vec2 lap = -c
    + 0.2 * (at(p + ivec2(1, 0), n) + at(p + ivec2(-1, 0), n)
           + at(p + ivec2(0, 1), n) + at(p + ivec2(0, -1), n))
    + 0.05 * (at(p + ivec2(1, 1), n) + at(p + ivec2(-1, 1), n)
            + at(p + ivec2(1, -1), n) + at(p + ivec2(-1, -1), n));
  float uvv = c.x * c.y * c.y;
  vec2 next = c + vec2(lap.x - uvv + uFk.x * (1.0 - c.x),
                       0.5 * lap.y + uvv - (uFk.x + uFk.y) * c.y);
  if (uRadius > 0.0) {
    vec2 ab = uBrush.zw - uBrush.xy;
    vec2 ap = gl_FragCoord.xy - uBrush.xy;
    float t = clamp(dot(ap, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
    if (length(ap - t * ab) < uRadius) next = vec2(0.5, 1.0);
  }
  outState = vec4(clamp(next, 0.0, 1.0), 0.0, 1.0);
}`;

const DISPLAY =
  HEAD +
  `uniform sampler2D uLut;
uniform vec2 uView;
uniform float uVmax;
out vec4 outColor;
float v(ivec2 p, ivec2 n) { return texelFetch(uState, (p + n) % n, 0).y; }
void main() {
  ivec2 n = textureSize(uState, 0);
  vec2 g = gl_FragCoord.xy / uView * vec2(n) - 0.5;
  ivec2 i = ivec2(floor(g));
  vec2 f = g - floor(g);
  float a = mix(v(i, n), v(i + ivec2(1, 0), n), f.x);
  float b = mix(v(i + ivec2(0, 1), n), v(i + ivec2(1, 1), n), f.x);
  float x = clamp(mix(a, b, f.y) / uVmax, 0.0, 1.0);
  outColor = texture(uLut, vec2(x * (255.0 / 256.0) + 0.5 / 256.0, 0.5));
}`;

/** Seed discs (cy, cx, r) on a 560 × 440 grid, as in make_assets.py::hero_field. */
const DISCS = [
  [90, 330, 14],
  [250, 120, 10],
  [420, 300, 12],
  [520, 60, 8],
  [330, 400, 7],
  [160, 40, 6],
] as const;

/** v at which the colormap reaches its top stop. The poster divides by the
 *  99.6th percentile of v, 0.394 for coral at 4,200 steps (make_assets.py). */
const V_MAX = 0.39;

export interface Grid {
  w: number;
  h: number;
}

export interface Engine {
  readonly grid: Grid;
  setParams(F: number, k: number): void;
  setTheme(theme: FieldTheme): void;
  /** Seed along a segment (grid cells, y up) during the next step() call. */
  brush(ax: number, ay: number, bx: number, by: number, radius: number): void;
  step(substeps: number): void;
  render(): void;
  /** New grid size: re-seeds the field. */
  reset(grid: Grid): void;
  destroy(): void;
}

/** Starts compiling and linking; does not wait for the driver. */
function compile(gl: WebGL2RenderingContext, frag: string) {
  const program = gl.createProgram();
  for (const [type, src] of [
    [gl.VERTEX_SHADER, VERT],
    [gl.FRAGMENT_SHADER, frag],
  ] as const) {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  const loc = (name: string) => gl.getUniformLocation(program, name);
  return { program, loc };
}

/**
 * Waits for the driver to finish the programs. Querying LINK_STATUS blocks the
 * main thread until compilation ends (180 ms for a cold cache on an M2 Pro), so
 * with KHR_parallel_shader_compile we poll its completion flag once per frame.
 */
async function linked(gl: WebGL2RenderingContext, programs: WebGLProgram[]) {
  const ext = gl.getExtension('KHR_parallel_shader_compile');
  if (ext) {
    while (
      !programs.every((p) =>
        gl.getProgramParameter(p, ext.COMPLETION_STATUS_KHR),
      )
    ) {
      await new Promise(requestAnimationFrame);
    }
  }
  return programs.every((p) => gl.getProgramParameter(p, gl.LINK_STATUS));
}

function seed({ w, h }: Grid) {
  const data = new Float32Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[4 * i] = 1;
    data[4 * i + 1] = 0.03 * Math.random();
    data[4 * i + 3] = 1;
  }
  const sx = w / 440;
  const sy = h / 560;
  const sr = Math.min(w, h) / 440;
  for (const [cy, cx, r0] of DISCS) {
    // Texture row 0 is the bottom of the canvas: flip y to match the poster.
    const y0 = h - 1 - cy * sy;
    const x0 = cx * sx;
    const r = r0 * sr;
    const reach = Math.ceil(r * 1.35);
    for (let y = Math.floor(y0 - reach); y <= y0 + reach; y++) {
      for (let x = Math.floor(x0 - reach); x <= x0 + reach; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const rr = r * (1 + 0.35 * Math.random());
        if ((x - x0) ** 2 + (y - y0) ** 2 >= rr * rr) continue;
        const i = 4 * (y * w + x);
        data[i] = 0.5;
        data[i + 1] = 1;
      }
    }
  }
  return data;
}

function lut(theme: FieldTheme) {
  const stops = FIELD_COLORMAPS[theme];
  const rgb = stops.map(([, hex]) =>
    [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)),
  );
  const out = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    let s = 1;
    while (s < stops.length - 1 && stops[s]![0] < x) s++;
    const [x0] = stops[s - 1]!;
    const [x1] = stops[s]!;
    const t = Math.min(1, Math.max(0, (x - x0) / (x1 - x0)));
    for (let c = 0; c < 3; c++) {
      out[4 * i + c] = Math.round(
        rgb[s - 1]![c]! + t * (rgb[s]![c]! - rgb[s - 1]![c]!),
      );
    }
    out[4 * i + 3] = 255;
  }
  return out;
}

/** Renderers that draw WebGL on the CPU: too slow for the field. */
const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render/i;

/**
 * Returns null when WebGL2 or a renderable float format is missing, or when
 * the browser renders WebGL in software (blocklisted GPU drivers, VMs, CI).
 */
export async function createEngine(
  canvas: HTMLCanvasElement,
  initial: Grid,
  { allowSoftware = false } = {},
): Promise<Engine | null> {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    failIfMajorPerformanceCaveat: !allowSoftware,
  });
  if (!gl) return null;
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : '';
  if (!allowSoftware && SOFTWARE.test(String(renderer))) return null;
  const full = gl.getExtension('EXT_color_buffer_float');
  if (!full && !gl.getExtension('EXT_color_buffer_half_float')) return null;

  const step = compile(gl, STEP);
  const display = compile(gl, DISPLAY);
  if (!(await linked(gl, [step.program, display.program]))) return null;
  const u = {
    fk: step.loc('uFk'),
    brush: step.loc('uBrush'),
    radius: step.loc('uRadius'),
    stepState: step.loc('uState'),
    state: display.loc('uState'),
    lut: display.loc('uLut'),
    view: display.loc('uView'),
    vmax: display.loc('uVmax'),
  };

  const lutTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, lutTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  let grid = initial;
  let textures: WebGLTexture[] = [];
  let fbos: WebGLFramebuffer[] = [];
  let src = 0;
  let F = 0.0545;
  let k = 0.062;
  let pending: [number, number, number, number, number] | null = null;

  /** Two state textures + framebuffers; tries RGBA32F, then RGBA16F. */
  function allocate(g: Grid) {
    const data = seed(g);
    for (const format of full ? [gl!.RGBA32F, gl!.RGBA16F] : [gl!.RGBA16F]) {
      textures.forEach((t) => gl!.deleteTexture(t));
      fbos.forEach((f) => gl!.deleteFramebuffer(f));
      textures = [];
      fbos = [];
      let complete = true;
      for (let i = 0; i < 2; i++) {
        const tex = gl!.createTexture();
        gl!.bindTexture(gl!.TEXTURE_2D, tex);
        gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.NEAREST);
        gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.NEAREST);
        gl!.texImage2D(
          gl!.TEXTURE_2D,
          0,
          format,
          g.w,
          g.h,
          0,
          gl!.RGBA,
          gl!.FLOAT,
          data,
        );
        const fbo = gl!.createFramebuffer();
        gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbo);
        gl!.framebufferTexture2D(
          gl!.FRAMEBUFFER,
          gl!.COLOR_ATTACHMENT0,
          gl!.TEXTURE_2D,
          tex,
          0,
        );
        complete &&=
          gl!.checkFramebufferStatus(gl!.FRAMEBUFFER) ===
          gl!.FRAMEBUFFER_COMPLETE;
        textures.push(tex);
        fbos.push(fbo);
      }
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
      if (complete) return true;
    }
    return false;
  }

  if (!allocate(grid)) return null;
  gl.bindVertexArray(gl.createVertexArray());

  return {
    get grid() {
      return grid;
    },
    setParams(nextF, nextK) {
      F = nextF;
      k = nextK;
    },
    setTheme(theme) {
      gl.bindTexture(gl.TEXTURE_2D, lutTex);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        256,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        lut(theme),
      );
    },
    brush(ax, ay, bx, by, radius) {
      pending = [ax, ay, bx, by, radius];
    },
    step(substeps) {
      gl.useProgram(step.program);
      gl.viewport(0, 0, grid.w, grid.h);
      gl.uniform2f(u.fk, F, k);
      gl.uniform1i(u.stepState, 0);
      gl.activeTexture(gl.TEXTURE0);
      for (let i = 0; i < substeps; i++) {
        const dst = 1 - src;
        if (pending) {
          gl.uniform4f(u.brush, pending[0], pending[1], pending[2], pending[3]);
          gl.uniform1f(u.radius, pending[4]);
        } else {
          gl.uniform1f(u.radius, 0);
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[dst]!);
        gl.bindTexture(gl.TEXTURE_2D, textures[src]!);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        src = dst;
      }
      pending = null;
    },
    render() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(display.program);
      gl.uniform2f(u.view, canvas.width, canvas.height);
      gl.uniform1f(u.vmax, V_MAX);
      gl.uniform1i(u.state, 0);
      gl.uniform1i(u.lut, 1);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, textures[src]!);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, lutTex);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    reset(next) {
      grid = next;
      src = 0;
      allocate(next);
    },
    destroy() {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
