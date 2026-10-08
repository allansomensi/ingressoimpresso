// Shared ticket drawing. Every value comes from /data.json (see src/render.rs); user text is
// only ever displayed as a string value, never evaluated as Typst code.

#let mm(value) = value * 1mm
#let fonts = (display: "Bebas Neue", mono: "Space Mono", sans: "Lato")
#let aligns = (left: left, center: center, right: right)

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
    place(top + left, dx: mm(n.xMm), dy: mm(n.yMm),
      box(width: mm(n.widthMm), height: mm(n.heightMm),
        align(aligns.at(n.align) + horizon,
          text(font: fonts.at(n.font), size: n.sizePt * 1pt, fill: rgb(n.color), t.label))))
    let q = d.qr
    place(top + left, dx: mm(q.xMm), dy: mm(q.yMm), image(t.qr, width: mm(q.sizeMm)))
    if t.sample {
      place(center + horizon, rotate(-15deg,
        text(font: "Lato", weight: "bold", size: h / 3, fill: rgb(200, 0, 0, 120),
          data.texts.sampleWatermark)))
    }
  })
}

// The stub (canhoto): number, event name and blank fields. Opaque white, so it also covers any
// art bleeding from the body in print-shop output.
#let stub(data, t) = {
  let s = data.design.stub
  let h = mm(data.design.heightMm)
  box(width: mm(s.widthMm), height: h, fill: white, inset: (x: 2.5mm, y: 2.5mm), {
    set text(font: "Lato", size: 6.5pt, fill: black)
    set par(leading: 0.4em)
    stack(dir: ttb, spacing: 1.6mm,
      text(font: "Space Mono", weight: "bold", size: 10pt, t.label),
      text(weight: "bold", data.eventName),
      ..s.fields.map(field => stack(dir: ttb, spacing: 0.8mm,
        text(size: 5.5pt, field),
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
    place(top + left, dx: stub-x, stub(data, t))
    place(top + left, dx: cut-x,
      line(angle: 90deg, length: h, stroke: (paint: luma(140), thickness: 0.5pt, dash: "dashed")))
  })
}
