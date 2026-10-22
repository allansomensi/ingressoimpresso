// Certificate of participation (ADRs 0113, 0114): one A4 page per side, drawn from the event's
// design. Every value comes from /data.json, already filled for the person (src/certificate.rs);
// user text is only displayed, never evaluated (CLAUDE.md invariant 5). The panel draws the same
// geometry in components/certificate/certificate-view.tsx: change both together.
#let data = json("/data.json")
#let mm(value) = value * 1mm
#let fonts = (
  display: "Bebas Neue", mono: "Space Mono", sans: "Lato", condensed: "Anton",
  serif: "Abril Fatface", script: "Great Vibes", casual: "Pacifico", slab: "Alfa Slab One",
  classic: "EB Garamond", roman: "Cinzel",
)
#let haligns = (left: left, center: center, right: right, justify: left)
#let valigns = (top: top, middle: horizon, bottom: bottom)
#let (W, H) = (mm(data.width), mm(data.height))
// Millimetres in a point.
#let pt-mm = 25.4 / 72

#set page(width: W, height: H, margin: 0mm)
#set text(font: "Lato", lang: "pt", hyphenate: false)

// `body` on a single line, shrunk (never enlarged) to fit `width` × `height`.
#let fit(width, height, body) = context {
  let size = measure(body)
  let line = box(width: size.width + 0.01pt, body)
  let factor = calc.min(1, width / (size.width + 0.01pt), height / calc.max(size.height, 0.01pt))
  if factor >= 1 { line } else { scale(factor * 100%, reflow: true, line) }
}

#let at(x, y, body) = place(top + left, dx: x, dy: y, body)

// ---- Frames -------------------------------------------------------------------------------------

#let frame(f) = {
  let (c, a, m, t) = (rgb(f.color), rgb(f.accent), mm(f.marginMm), mm(f.thicknessMm))
  let outline(offset, thickness, paint) = at(offset + thickness / 2, offset + thickness / 2,
    rect(width: W - 2 * offset - thickness, height: H - 2 * offset - thickness, stroke: thickness + paint))
  let diamond(cx, cy, r, paint) = at(0mm, 0mm,
    polygon(fill: paint, (cx, cy - r), (cx + r, cy), (cx, cy + r), (cx - r, cy)))
  if f.style == "simple" {
    outline(m, t, c)
  } else if f.style == "double" {
    let thin = calc.max(t * 0.35, 0.25mm)
    outline(m, t, c)
    outline(m + t + 1.5mm, thin, c)
  } else if f.style == "band" {
    if f.marginMm > 0 { outline(0mm, m, c) }
    outline(m + 2.5mm, t, a)
  } else if f.style == "classic" {
    outline(m, t, c)
    outline(m + t + 1.8mm, 0.3mm, a)
    let r = calc.max(2.6mm, t * 2)
    for (cx, cy) in ((m + t / 2, m + t / 2), (W - m - t / 2, m + t / 2), (m + t / 2, H - m - t / 2), (W - m - t / 2, H - m - t / 2)) {
      diamond(cx, cy, r, a)
    }
  } else if f.style == "corners" {
    let arm = calc.min(24mm, (W - 2 * m) / 3)
    let bracket(x, y, sx, sy, length, thickness, paint) = {
      let stroke = (paint: paint, thickness: thickness, cap: "square")
      at(0mm, 0mm, line(start: (x, y), end: (x + sx * length, y), stroke: stroke))
      at(0mm, 0mm, line(start: (x, y), end: (x, y + sy * length), stroke: stroke))
    }
    let o = m + t / 2
    let i = m + t + 2.5mm
    let thin = calc.max(t / 2, 0.2mm)
    for (sx, sy) in ((1, 1), (-1, 1), (1, -1), (-1, -1)) {
      let x(offset) = if sx == 1 { offset } else { W - offset }
      let y(offset) = if sy == 1 { offset } else { H - offset }
      bracket(x(o), y(o), sx, sy, arm, t, c)
      bracket(x(i + thin / 2), y(i + thin / 2), sx, sy, arm * 0.6, thin, a)
    }
  } else if f.style == "geometric" {
    let big = calc.min(W, H) * 0.3
    let s = calc.max(t, 1mm)
    at(0mm, 0mm, polygon(fill: c, (0mm, 0mm), (big, 0mm), (0mm, big)))
    at(0mm, 0mm, polygon(fill: a, (big + 3mm, 0mm), (big + 3mm + s, 0mm), (0mm, big + 3mm + s), (0mm, big + 3mm)))
    at(0mm, 0mm, polygon(fill: c, (W, H), (W - big, H), (W, H - big)))
    at(0mm, 0mm, polygon(fill: a, (W - big - 3mm, H), (W - big - 3mm - s, H), (W, H - big - 3mm - s), (W, H - big - 3mm)))
  } else if f.style == "side" {
    if f.marginMm > 0 { at(0mm, 0mm, rect(width: m, height: H, fill: c)) }
    at(m + 1.5mm, 0mm, rect(width: t, height: H, fill: a))
  }
}

// ---- Elements -----------------------------------------------------------------------------------

// The paragraph of a text element at `size`. Each line is exactly 1 em tall (top and bottom
// edges), so `lineHeight` × size is the distance between baselines, as in the preview.
#let paragraph(e, size) = {
  set text(font: fonts.at(e.font), size: size, fill: rgb(e.color), tracking: e.letterSpacing * 1em,
    weight: if e.bold { "bold" } else { "regular" }, style: if e.italic { "italic" } else { "normal" },
    top-edge: 0.8em, bottom-edge: -0.2em)
  set par(leading: (e.lineHeight - 1) * 1em, justify: e.align == "justify", spacing: (e.lineHeight - 1) * 1em)
  align(haligns.at(e.align), for s in e.segments {
    let value = if e.uppercase { upper(s.text) } else { s.text }
    if s.strong and e.boldName { text(weight: "bold", value) } else { value }
  })
}

// A text: the largest size up to `sizePt` whose paragraph fits the box.
#let text-element(e) = context {
  let (w, h) = (mm(e.widthMm), mm(e.heightMm))
  let height-at(size) = measure(block(width: w, paragraph(e, size))).height
  let size = e.sizePt * 1pt
  if height-at(size) > h + 0.01pt {
    let (low, high) = (size * 0.1, size)
    for _ in range(14) {
      let mid = (low + high) / 2
      if height-at(mid) <= h + 0.01pt { low = mid } else { high = mid }
    }
    size = low
  }
  box(width: w, height: h, align(valigns.at(e.valign), block(width: w, paragraph(e, size))))
}

#let image-element(e) = {
  let (w, h) = (mm(e.widthMm), mm(e.heightMm))
  box(width: w, height: h, align(center + horizon, image(e.path, width: w, height: h, fit: "contain")))
}

#let signature-element(e) = {
  let (w, h) = (mm(e.widthMm), mm(e.heightMm))
  let size = e.sizePt
  // Room for the name and the role is kept even when they are empty: signatures side by side
  // put their lines at the same height.
  let name-h = size * 1.3 * pt-mm
  let role-h = size * 0.8 * 1.3 * pt-mm
  let line-y = e.heightMm - name-h - role-h - 1.2
  let ink = rgb(e.color)
  box(width: w, height: h, {
    if e.path != none and line-y > 2.5 {
      at(0mm, 0mm, box(width: w, height: mm(line-y - 0.5), align(center + bottom,
        image(e.path, width: w, height: mm(line-y - 0.5), fit: "contain"))))
    }
    at(w * 0.075, mm(line-y), line(length: w * 0.85, stroke: 0.6pt + rgb(e.lineColor)))
    if e.name != "" {
      at(0mm, mm(line-y + 1.2), box(width: w, height: mm(name-h), align(center + horizon,
        fit(w, mm(name-h), text(font: fonts.at(e.font), size: size * 1pt, fill: ink, e.name)))))
    }
    if e.role != "" {
      at(0mm, mm(line-y + 1.2 + name-h), box(width: w, height: mm(role-h), align(center + horizon,
        fit(w, mm(role-h), text(font: fonts.at(e.font), size: size * 0.8 * 1pt, fill: ink.transparentize(25%), e.role)))))
    }
  })
}

#let qr-element(e) = {
  let s = mm(e.sizeMm)
  box(width: s, height: s, fill: white, image(e.path, width: s, height: s))
}

#let line-element(e) = {
  let (w, h) = (mm(e.widthMm), mm(e.heightMm))
  let t = mm(e.thicknessMm)
  let c = rgb(e.color)
  let across = e.widthMm >= e.heightMm
  let length = if across { w } else { h }
  let middle = if across { h / 2 } else { w / 2 }
  // A segment along the line, from `a` to `b`, shifted `shift` across it.
  let segment(a, b, shift, stroke) = if across {
    at(0mm, 0mm, line(start: (a, middle + shift), end: (b, middle + shift), stroke: stroke))
  } else {
    at(0mm, 0mm, line(start: (middle + shift, a), end: (middle + shift, b), stroke: stroke))
  }
  box(width: w, height: h, {
    if e.style == "solid" {
      segment(0mm, length, 0mm, t + c)
    } else if e.style == "double" {
      let d = (t + calc.max(t, 0.4mm)) / 2
      segment(0mm, length, -d, t + c)
      segment(0mm, length, d, t + c)
    } else if e.style == "dotted" {
      segment(0mm, length, 0mm, (paint: c, thickness: t, cap: "round", dash: (0mm, t * 2.5)))
    } else if e.style == "ornament" {
      let r = calc.max(t * 3, 1.2mm)
      let gap = 1mm
      segment(0mm, length / 2 - r - gap, 0mm, t + c)
      segment(length / 2 + r + gap, length, 0mm, t + c)
      let (cx, cy) = if across { (length / 2, middle) } else { (middle, length / 2) }
      at(0mm, 0mm, polygon(fill: c, (cx, cy - r), (cx + r, cy), (cx, cy + r), (cx - r, cy)))
    }
  })
}

#let shape-element(e) = rect(width: mm(e.widthMm), height: mm(e.heightMm), radius: mm(e.radiusMm),
  fill: rgb(e.color).transparentize((1 - e.opacity) * 100%))

#let seal-element(e) = {
  let d = mm(e.sizeMm)
  let r = d / 2
  let points = range(80).map(i => {
    let angle = i * 4.5deg
    let radius = if calc.rem(i, 2) == 0 { r } else { r * 0.93 }
    (r + radius * calc.sin(angle), r - radius * calc.cos(angle))
  })
  let ink = rgb(e.textColor)
  let small-h = d * 0.11
  let big-h = d * 0.24
  let inner = d * 0.62
  box(width: d, height: d, {
    at(0mm, 0mm, polygon(fill: rgb(e.color), ..points))
    at(r - r * 0.8, r - r * 0.8, circle(radius: r * 0.8, stroke: calc.max(d * 0.012, 0.3pt) + ink))
    let small = if e.text != "" {
      fit(inner, small-h, text(font: "Lato", weight: "bold", size: small-h, fill: ink, tracking: 0.08em, upper(e.text)))
    }
    let big = if e.center != "" {
      fit(inner, big-h, text(font: "Cinzel", weight: "bold", size: big-h * 1.25, fill: ink, e.center))
    }
    let total = (if small != none { small-h } else { 0mm }) + (if big != none { big-h } else { 0mm }) + (if small != none and big != none { d * 0.03 } else { 0mm })
    let top = r - total / 2
    if small != none {
      at(r - inner / 2, top, box(width: inner, height: small-h, align(center + horizon, small)))
    }
    if big != none {
      let y = if small != none { top + small-h + d * 0.03 } else { top }
      at(r - inner / 2, y, box(width: inner, height: big-h, align(center + horizon, big)))
    }
  })
}

#let element(e) = at(mm(e.xMm), mm(e.yMm),
  if e.kind == "text" { text-element(e) }
  else if e.kind == "image" { image-element(e) }
  else if e.kind == "signature" { signature-element(e) }
  else if e.kind == "qr" { qr-element(e) }
  else if e.kind == "line" { line-element(e) }
  else if e.kind == "shape" { shape-element(e) }
  else if e.kind == "seal" { seal-element(e) })

// "Emitido com Ingresso Impresso": a line on a light strip, or the faint watermark (ADR 0116):
// "EMITIDO COM", the mark and the name in the paper's ink, on a strip of the paper that interrupts
// a frame passing under it.
#let brand-box(b) = if b.style == "line" {
  box(fill: white.transparentize(15%), inset: (x: 2.2mm, y: 1mm), radius: 1mm,
    text(font: "Lato", size: 6.5pt, fill: rgb("#6b6b78"), b.text))
} else {
  let ink = rgb(b.ink)
  box(fill: rgb(b.paper), inset: (x: 2.6mm, y: 0.9mm), radius: 1mm,
    grid(columns: 3, column-gutter: 1.5mm, align: horizon,
      text(font: "Lato", size: 5pt, tracking: 0.14em, fill: ink.transparentize(55%), upper(b.caption)),
      box(height: 3.8mm, image("/brand-mark.svg", height: 3.8mm)),
      text(font: "Lato", size: 7.5pt, tracking: -0.01em, fill: ink.transparentize(42%),
        [#text(weight: "bold")[Ingresso] Impresso])))
}

// ---- Pages --------------------------------------------------------------------------------------

#for (index, p) in data.pages.enumerate() {
  if index > 0 { pagebreak() }
  at(0mm, 0mm, rect(width: W, height: H, fill: rgb(p.backgroundColor)))
  if p.backgroundImage != none {
    at(0mm, 0mm, image(p.backgroundImage, width: W, height: H, fit: "cover"))
  }
  if p.frame != none { frame(p.frame) }
  for e in p.elements { element(e) }
  if p.brand != none {
    let mark = brand-box(p.brand)
    if data.brandPosition == none {
      place(bottom + center, dy: -3mm, mark)
    } else {
      // Moved by the editor (ADR 0118): its centre at the saved point.
      let (x, y) = (mm(data.brandPosition.xMm), mm(data.brandPosition.yMm))
      context {
        let size = measure(mark)
        place(top + left, dx: x - size.width / 2, dy: y - size.height / 2, mark)
      }
    }
  }
  if data.sample != none {
    place(center + horizon, rotate(-24deg,
      text(font: "Lato", weight: "bold", size: calc.min(W, H) / 5, tracking: 0.08em,
        fill: rgb(200, 0, 0, 46), data.sample)))
  }
}
