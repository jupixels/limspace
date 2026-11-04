// A hand-drawn floor plan on a grid of cells: carve rooms, draw walls, cut doorways,
// then turn it into floors, ceilings, wall faces and colliders.
export class Grid {
  constructor(w, h, cell = 2) {
    this.w = w;
    this.h = h;
    this.cell = cell;
    this.c = new Array(w * h).fill('#');
  }

  get(c, r) { return c < 0 || r < 0 || c >= this.w || r >= this.h ? '#' : this.c[r * this.w + c]; }
  set(c, r, ch) { if (c >= 0 && r >= 0 && c < this.w && r < this.h) this.c[r * this.w + c] = ch; }
  // inclusive cell rectangles
  fill(c1, r1, c2, r2, ch) { for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) this.set(c, r, ch); return this; }
  wallH(r, c1, c2) { return this.fill(c1, r, c2, r, '#'); }
  wallV(c, r1, r2) { return this.fill(c, r1, c, r2, '#'); }
  door(c, r) { this.set(c, r, '+'); return this; }

  isWall(ch) { return ch === '#'; }

  // a doorway takes the room of its first open neighbour
  resolve() {
    this.doors = [];
    for (let r = 0; r < this.h; r++) {
      for (let c = 0; c < this.w; c++) {
        if (this.get(c, r) !== '+') continue;
        const n = [[c - 1, r], [c + 1, r], [c, r - 1], [c, r + 1]].map(([a, b]) => this.get(a, b)).find((ch) => ch !== '#' && ch !== '+');
        this.set(c, r, n ?? '.');
        this.doors.push([c, r]);
      }
    }
  }

  // Build it. styles[ch] = { floor, ceil, wall, base, height, door } materials and sizes.
  build(ctx, styles, ox = 0, oz = 0) {
    this.resolve();
    const S = this.cell;
    const X = (c) => ox + c * S, Z = (r) => oz + r * S;
    const st = (ch) => styles[ch];

    // floors and ceilings, merged along rows
    for (let r = 0; r < this.h; r++) {
      let c = 0;
      while (c < this.w) {
        const ch = this.get(c, r);
        if (this.isWall(ch)) { c++; continue; }
        let e = c;
        while (e + 1 < this.w && this.get(e + 1, r) === ch) e++;
        const s = st(ch);
        // a hair of overlap so neighbouring strips never leave a crack of light between them
        const o = 0.004;
        if (s.floor) ctx.box(X(c) - o, X(e + 1) + o, -0.1, 0, Z(r) - o, Z(r + 1) + o, s.floor);
        if (s.ceil) ctx.box(X(c) - o, X(e + 1) + o, s.height, s.height + 0.12, Z(r) - o, Z(r + 1) + o, s.ceil);
        c = e + 1;
      }
    }

    // wall colliders, merged along rows
    for (let r = 0; r < this.h; r++) {
      let c = 0;
      while (c < this.w) {
        if (!this.isWall(this.get(c, r))) { c++; continue; }
        let e = c;
        while (e + 1 < this.w && this.isWall(this.get(e + 1, r))) e++;
        ctx.collide(X(c), X(e + 1), Z(r), Z(r + 1), -0.2, 8);
        c = e + 1;
      }
    }

    // wall faces: each open cell paints the walls around it in its own paper
    const face = (dir) => {
      const horiz = dir === 'n' || dir === 's';
      const [outer, inner] = horiz ? [this.h, this.w] : [this.w, this.h];
      for (let a = 0; a < outer; a++) {
        let b = 0;
        while (b < inner) {
          const [c, r] = horiz ? [b, a] : [a, b];
          const ch = this.get(c, r);
          const [nc, nr] = { n: [c, r - 1], s: [c, r + 1], w: [c - 1, r], e: [c + 1, r] }[dir];
          if (this.isWall(ch) || !this.isWall(this.get(nc, nr))) { b++; continue; }
          let e = b;
          const same = (k) => {
            const [cc, rr] = horiz ? [k, a] : [a, k];
            const [n2c, n2r] = { n: [cc, rr - 1], s: [cc, rr + 1], w: [cc - 1, rr], e: [cc + 1, rr] }[dir];
            return this.get(cc, rr) === ch && this.isWall(this.get(n2c, n2r));
          };
          while (e + 1 < inner && same(e + 1)) e++;
          const s = st(ch), h = s.height, t = 0.06;
          let x1, x2, z1, z2;
          if (dir === 'n') { x1 = X(b); x2 = X(e + 1); z1 = Z(r) - t; z2 = Z(r); }
          if (dir === 's') { x1 = X(b); x2 = X(e + 1); z1 = Z(r + 1); z2 = Z(r + 1) + t; }
          if (dir === 'w') { z1 = Z(b); z2 = Z(e + 1); x1 = X(c) - t; x2 = X(c); }
          if (dir === 'e') { z1 = Z(b); z2 = Z(e + 1); x1 = X(c + 1); x2 = X(c + 1) + t; }
          ctx.box(x1, x2, 0, h, z1, z2, s.wall);
          if (s.base) {
            const o = 0.03;
            if (dir === 'n') ctx.box(x1, x2, 0, 0.12, z2, z2 + o, s.base);
            if (dir === 's') ctx.box(x1, x2, 0, 0.12, z1 - o, z1, s.base);
            if (dir === 'w') ctx.box(x2, x2 + o, 0, 0.12, z1, z2, s.base);
            if (dir === 'e') ctx.box(x1 - o, x1, 0, 0.12, z1, z2, s.base);
          }
          b = e + 1;
        }
      }
    };
    for (const d of ['n', 's', 'w', 'e']) face(d);

    // where two rooms of different height meet, close the step in the ceiling
    for (let r = 0; r < this.h; r++) {
      for (let c = 0; c < this.w; c++) {
        const a = this.get(c, r);
        if (this.isWall(a)) continue;
        for (const [dc, dr] of [[1, 0], [0, 1]]) {
          const b = this.get(c + dc, r + dr);
          if (this.isWall(b) || a === b) continue;
          const ha = st(a).height, hb = st(b).height;
          if (Math.abs(ha - hb) < 0.01) continue;
          const hi = ha > hb ? a : b;
          const y1 = Math.min(ha, hb), y2 = Math.max(ha, hb);
          if (dc) ctx.box(X(c + 1) - 0.03, X(c + 1) + 0.03, y1, y2, Z(r), Z(r + 1), st(hi).wall);
          else ctx.box(X(c), X(c + 1), y1, y2, Z(r + 1) - 0.03, Z(r + 1) + 0.03, st(hi).wall);
        }
      }
    }

    // a lintel over every doorway
    for (const [c, r] of this.doors) {
      const s = st(this.get(c, r));
      if (s.door === false) continue;
      const dh = s.doorH ?? 2.2;
      ctx.box(X(c), X(c + 1), dh, s.height, Z(r), Z(r + 1), s.wall);
    }

    // rooms, for fog, sound and footsteps
    for (let r = 0; r < this.h; r++) {
      let c = 0;
      while (c < this.w) {
        const ch = this.get(c, r);
        if (this.isWall(ch)) { c++; continue; }
        let e = c;
        while (e + 1 < this.w && this.get(e + 1, r) === ch) e++;
        if (st(ch).zone) ctx.zone(X(c), X(e + 1), Z(r), Z(r + 1), st(ch).zone);
        c = e + 1;
      }
    }
  }

  // every open cell of one kind, as world-space centres
  cells(ch) {
    const out = [];
    for (let r = 0; r < this.h; r++) for (let c = 0; c < this.w; c++) if (this.get(c, r) === ch) out.push([c * this.cell + this.cell / 2, r * this.cell + this.cell / 2, c, r]);
    return out;
  }
}
