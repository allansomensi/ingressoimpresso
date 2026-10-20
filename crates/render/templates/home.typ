// Home printing: A4 sheets, tickets edge to edge with cut marks in the margins, or one per piece
// of a ready-made paper (perforated or labels, ADR 0102), scaled to fit when needed.
#import "/ticket.typ": ticket, mm

#let data = json("/data.json")
#let g = data.grid
#set page(width: 210mm, height: 297mm, margin: 0mm)
#set text(font: "Lato")

#let mark-len = 5mm
#let mark-gap = 1.5mm
#let mark = (paint: black, thickness: 0.3pt)

#let cut-marks() = {
  let x0 = mm(g.originXMm)
  let y0 = mm(g.originYMm)
  let x1 = x0 + g.cols * mm(g.cellWMm)
  let y1 = y0 + g.rows * mm(g.cellHMm)
  for i in range(g.cols + 1) {
    let x = x0 + i * mm(g.cellWMm)
    place(top + left, dx: x, dy: y0 - mark-gap - mark-len, line(angle: 90deg, length: mark-len, stroke: mark))
    place(top + left, dx: x, dy: y1 + mark-gap, line(angle: 90deg, length: mark-len, stroke: mark))
  }
  for j in range(g.rows + 1) {
    let y = y0 + j * mm(g.cellHMm)
    place(top + left, dx: x0 - mark-gap - mark-len, dy: y, line(length: mark-len, stroke: mark))
    place(top + left, dx: x1 + mark-gap, dy: y, line(length: mark-len, stroke: mark))
  }
}

#let fitted(item) = {
  let turned = if g.rotated { rotate(90deg, reflow: true, item) } else { item }
  if g.scale == 1 { turned } else { scale(g.scale * 100%, reflow: true, turned) }
}

#for (index, page-tickets) in data.tickets.chunks(g.cols * g.rows).enumerate() {
  if index > 0 { pagebreak() }
  if g.marks { cut-marks() }
  for (i, t) in page-tickets.enumerate() {
    let col = calc.rem(i, g.cols)
    let row = calc.quo(i, g.cols)
    place(top + left,
      dx: mm(g.originXMm) + col * mm(g.pitchXMm) + mm(g.insetXMm),
      dy: mm(g.originYMm) + row * mm(g.pitchYMm) + mm(g.insetYMm),
      fitted(ticket(data, t)))
  }
}
