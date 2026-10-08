// Print shop: one ticket per page at final size, art running into the bleed, crop marks in
// the slug area outside the bleed. Typst writes the TrimBox from the page bleed.
#import "/ticket.typ": ticket, mm

#let data = json("/data.json")
#let p = data.print
#let b = mm(data.bleedMm)
#let slug = if p.cropMarks { mm(p.slugMm) } else { 0mm }
#let w = mm(data.design.widthMm) + if data.design.stub == none { 0mm } else { mm(data.design.stub.widthMm) }
#let h = mm(data.design.heightMm)

#set page(width: w, height: h, margin: 0mm, bleed: b + slug)
#set text(font: "Lato")

#let mark = (paint: black, thickness: 0.25pt)
#let crop-marks() = {
  let start = b + 1mm
  let len = slug - 1mm
  for (x, dir) in ((0mm, -1), (w, 1)) {
    for y in (0mm, h) {
      // Horizontal mark at height y, outside the trim on the x side.
      place(top + left, dx: if dir < 0 { x - start - len } else { x + start }, dy: y,
        line(length: len, stroke: mark))
    }
  }
  for (y, dir) in ((0mm, -1), (h, 1)) {
    for x in (0mm, w) {
      place(top + left, dx: x, dy: if dir < 0 { y - start - len } else { y + start },
        line(angle: 90deg, length: len, stroke: mark))
    }
  }
}

#for (index, t) in data.tickets.enumerate() {
  if index > 0 { pagebreak() }
  place(top + left, ticket(data, t, clip: false))
  if p.cropMarks { crop-marks() }
}
