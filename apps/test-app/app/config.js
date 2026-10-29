// Recursos de DEV que usa la app (compañía MAGICFEEDBACK_DEV, nunca datos de clientes).
// Son claves PÚBLICAS: las mismas que llevaría el HTML de cualquier web que integre el SDK.
//
// Creados para MF-3243 (ver apps/test-app/README.md, "Fixtures en DEV").
export const DEV = {
  company: 'MAGICFEEDBACK_DEV',
  /** PopupOption "SDK Test App": apiKey del SDK con ?popups=live */
  popupsApiKey: '7nWNe3mZTzRgS1gh1YunsEcoQac56U0s',
  /** publicKey del producto de las encuestas (va en popup.productId) */
  productKey: '3c75ebc69b72f7cf1e4a6774a8e78711',
  surveys: {
    simple: '5581b5a0-d2df-11f1-b287-1be76c3f931d',
    complex: '7c78d670-d2df-11f1-b287-1be76c3f931d',
  },
};
