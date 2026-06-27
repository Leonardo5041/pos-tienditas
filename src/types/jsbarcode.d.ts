declare module "jsbarcode" {
  function JsBarcode(element: Element | string, barcode: string, options?: Record<string, unknown>): void;
  export default JsBarcode;
}
