# 0010. Leitura de QR no navegador com zxing-wasm

- **Status:** Proposto
- **Data:** 2026-10-08

## Contexto

A portaria lê QR pela câmera no navegador, no Android e no iPhone, offline, com rapidez e
tolerância a impressões ruins e telas trincadas.

## Opções consideradas

1. **`BarcodeDetector` nativo.** É rápido no Chrome para Android, mas **não está disponível por
   padrão no Safari do iPhone**: fica atrás de flag, e a flag parou de funcionar no iOS 18.
   Sozinho, não serve.
2. **`jsQR`.** JavaScript puro e pequeno, mas mais lento e menos robusto com baixa resolução,
   reflexo e inclinação. Pouca manutenção.
3. **`html5-qrcode` / `@zxing/library`.** Port JS do ZXing, com manutenção irregular.
4. **`zxing-wasm`** (zxing-cpp compilado para WASM, com API compatível com BarcodeDetector).
   Robusto e mantido, com o mesmo comportamento em todos os navegadores. Custa cerca de 1 MB de
   WASM, que precisa ser hospedado por nós.

## Decisão

Opção 4 em todos os navegadores, usando um único caminho de código.

- O `.wasm` é servido pela nossa origem (`locateFile`/`prepareZXingModule`) e pré-cacheado pelo
  Service Worker. **Nunca** vem de CDN em tempo de execução, porque precisa funcionar offline.
- Restringimos a leitura ao formato QR. Quando houver vários QR no quadro, fica o primeiro que
  `ticket-core` reconhece como ingresso v1.
- A câmera usa `getUserMedia` com `facingMode: environment`, lanterna (`torch`) quando houver
  suporte e Wake Lock.

## Consequências

- O mesmo comportamento no Android e no iPhone simplifica testes e suporte.
- O primeiro acesso baixa cerca de 1 MB a mais (uma vez só).
- Se medições em campo mostrarem que o `BarcodeDetector` nativo é melhor no Android, ele pode ser
  ativado por detecção de recurso, já que as APIs são compatíveis.
