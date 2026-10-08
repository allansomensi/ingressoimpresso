// Control sheet: one section per seller, one row per ticket, columns filled by hand.
#let data = json("/data.json")
#let tx = data.texts

// Long sheets are compiled in chunks (src/render.rs): numbering continues from `pageOffset`.
#set page(paper: "a4", margin: (x: 14mm, top: 14mm, bottom: 16mm),
  footer: context align(right, text(size: 7pt, fill: luma(100),
    [#tx.page #counter(page).display()])))
#set text(font: "Lato", size: 9pt, lang: "pt")
#counter(page).update(data.pageOffset + 1)

#for (index, group) in data.groups.enumerate() {
  if index > 0 { pagebreak() }
  block(below: 4mm, {
    text(size: 15pt, weight: "bold", tx.controlTitle)
    linebreak()
    text(size: 10pt, data.eventName)
    linebreak()
    text(size: 10pt, [#tx.seller: #strong(group.seller) — #group.total #tx.tickets])
    if group.continued { text(size: 10pt, [ #tx.continued]) }
  })
  table(
    columns: (auto, 1fr, 0.6fr, auto),
    inset: (x: 2.5mm, y: 2.6mm),
    stroke: 0.4pt + luma(150),
    fill: (_, row) => if row == 0 { luma(230) },
    table.header(
      text(weight: "bold", tx.number),
      text(weight: "bold", tx.buyerName),
      text(weight: "bold", tx.phone),
      text(weight: "bold", tx.paid),
    ),
    ..group.rows.map(label => (text(font: "Space Mono", label), [], [], box(width: 3.5mm, height: 3.5mm, stroke: 0.5pt))).flatten(),
  )
}
