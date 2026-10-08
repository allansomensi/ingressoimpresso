// Shared ticket drawing. Every value comes from /data.json (see src/render.rs); user text is
// only ever displayed as a string value, never evaluated as Typst code.

#let mm(value) = value * 1mm
#let fonts = (display: "Bebas Neue", mono: "Space Mono", sans: "Lato")
#let aligns = (left: left, center: center, right: right)

// `body` on a single line, shrunk (never enlarged) to fit `width` × `height`.
#let fit(width, height, body) = context {
  let size = measure(body)
  // A box exactly as wide as the text never wraps it.
  let line = box(width: size.width + 0.01pt, body)
  let factor = calc.min(1, width / (size.width + 0.01pt), height / calc.max(size.height, 0.01pt))
  if factor >= 1 { line } else { scale(factor * 100%, reflow: true, line) }
}

// `value` cut with "…" to at most `lines` lines of `width`, set with `style`.
#let clamp(value, width, lines, style) = context {
  let height-of(s) = measure(block(width: width, style(s))).height
  let limit = height-of(range(lines).map(_ => "X").join("\n")) + 0.01pt
  if height-of(value) <= limit {
    style(value)
  } else {
    let chars = value.clusters()
    let (low, high) = (0, chars.len())
    while low < high {
      let mid = calc.quo(low + high + 1, 2)
      if height-of(chars.slice(0, mid).join() + "…") <= limit { low = mid } else { high = mid - 1 }
    }
    style(chars.slice(0, low).join().trim() + "…")
  }
}

// The ticket body (art, number, QR). The art always covers body + bleed on every side.
// `clip`: cut everything at the trim (home sheets, images); `false` lets the art run into the
// bleed (print-shop output).
#let body(data, t, clip: true) = {
  let d = data.design
  let w = mm(d.widthMm)
  let h = mm(d.heightMm)
  let b = mm(data.bleedMm)
  box(width: w, height: h, clip: clip, {
    place(top + left, dx: -b, dy: -b,
      rect(width: w + 2 * b, height: h + 2 * b, fill: rgb(d.backgroundColor), stroke: none))
    if data.art != none {
      place(top + left, dx: -b, dy: -b,
        image(data.art, width: w + 2 * b, height: h + 2 * b, fit: "cover"))
    }
    let n = d.number
    let (nw, nh) = (mm(n.widthMm), mm(n.heightMm))
    place(top + left, dx: mm(n.xMm), dy: mm(n.yMm),
      box(width: nw, height: nh,
        align(aligns.at(n.align) + horizon, fit(nw, nh,
          // Glyph bounds: the visible ink is centred and kept inside the box.
          text(font: fonts.at(n.font), size: n.sizePt * 1pt, fill: rgb(n.color),
            top-edge: "bounds", bottom-edge: "bounds", t.label)))))
    let q = d.qr
    place(top + left, dx: mm(q.xMm), dy: mm(q.yMm), image(t.qr, width: mm(q.sizeMm)))
    if t.sample {
      // "AMOSTRA" is about 4.6 × the font size wide once rotated: keep it inside the trim.
      place(center + horizon, rotate(-15deg,
        text(font: "Lato", weight: "bold", size: calc.min(h / 3, w / 5.5), fill: rgb(200, 0, 0, 120),
          data.texts.sampleWatermark)))
    }
  })
}

// The stub (canhoto): number, event name (at most two lines) and blank fields sharing the rest
// of the height. Opaque white and clipped at its trim. Validation guarantees the minimum
// height (design.rs, `stub_min_height_mm`).
#let stub(data, t) = {
  let s = data.design.stub
  let h = mm(data.design.heightMm)
  let inner = mm(s.widthMm) - 5mm
  box(width: mm(s.widthMm), height: h, fill: white, clip: true, inset: 2.5mm, {
    set text(font: "Lato", size: 6.5pt, fill: black, hyphenate: true)
    set par(leading: 0.4em)
    grid(
      columns: (inner,),
      rows: (auto, auto, ..s.fields.map(_ => 1fr)),
      row-gutter: 1.6mm,
      fit(inner, 4mm, text(font: "Space Mono", weight: "bold", size: 10pt, t.label)),
      clamp(data.eventName, inner, 2, value => text(weight: "bold", value)),
      ..s.fields.map(field => stack(dir: ttb,
        fit(inner, 2mm, text(size: 5.5pt, field)),
        1fr,
        line(length: 100%, stroke: 0.4pt + luma(120)))),
    )
  })
}

// Body plus optional stub, separated by a dashed perforation line.
#let ticket(data, t, clip: true) = {
  let d = data.design
  let h = mm(d.heightMm)
  if d.stub == none {
    return body(data, t, clip: clip)
  }
  let stub-w = mm(d.stub.widthMm)
  let total = mm(d.widthMm) + stub-w
  let (body-x, stub-x, cut-x) = if d.stub.side == "left" {
    (stub-w, 0mm, stub-w)
  } else {
    (0mm, mm(d.widthMm), mm(d.widthMm))
  }
  box(width: total, height: h, {
    place(top + left, dx: body-x, body(data, t, clip: clip))
    if not clip {
      // The art bleeds past the body on every side; above and below the stub, its bleed must
      // stay white like the stub itself.
      let b = mm(data.bleedMm)
      place(top + left, dx: stub-x, dy: -b, rect(width: stub-w, height: h + 2 * b, fill: white))
    }
    place(top + left, dx: stub-x, stub(data, t))
    place(top + left, dx: cut-x,
      line(angle: 90deg, length: h, stroke: (paint: luma(140), thickness: 0.5pt, dash: "dashed")))
  })
}
