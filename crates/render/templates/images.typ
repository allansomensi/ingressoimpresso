// One page per ticket body (no stub, no bleed), rasterized for WhatsApp.
#import "/ticket.typ": body, mm

#let data = json("/data.json")
#set page(width: mm(data.design.widthMm), height: mm(data.design.heightMm), margin: 0mm)
#set text(font: "Lato")

#for (index, t) in data.tickets.enumerate() {
  if index > 0 { pagebreak() }
  place(top + left, body(data, t))
}
