/**
 * CSS vendorizado de cada versión de survey SDK asignable (DD-70), para el popup DOM. Va dentro
 * del SDK como chunks perezosos (texto): solo se descarga la hoja de la versión que tenga
 * asignada un survey, sin depender del CDN. Las claves son `SUPPORTED_SURVEY_SDK_VERSIONS`
 * (un test lo comprueba). La de la versión empaquetada es `src/assets/style.css`.
 */
export const SURVEY_CSS_LOADERS: Record<string, () => Promise<{ default: string }>> = {
  '2.2.37': () => import('../assets/survey-css/2.2.37.css'),
  '2.2.38': () => import('../assets/survey-css/2.2.38.css'),
  '2.2.39': () => import('../assets/survey-css/2.2.39.css'),
};
