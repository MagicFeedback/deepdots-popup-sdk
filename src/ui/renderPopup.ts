import type { DeepdotsEventType } from '../types';
import magicfeedback from "@magicfeedback/native";
import "@magicfeedback/native/dist/styles/magicfeedback-default.css";


/**
 * Renderiza el popup dentro del contenedor dado usando MagicFeedback para la encuesta.
 */
export async function renderPopup(
    container: HTMLElement,
    surveyId: string,
    productId: string,
    data: Record<string, unknown> | undefined,
    emit: (type: DeepdotsEventType, surveyId: string, data?: Record<string, unknown>) => void,
    onClose: () => void
): Promise<void> {
    console.log('[MagicFeedback] Rendering popup for survey:', surveyId);
  const popup = document.createElement('div');
  popup.className = 'deepdots-popup';
  popup.style.cssText = `
    background: white;
    border-radius: 8px;
    padding: 24px;
    max-width: 600px;
    width: 90%;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    position: relative;
  `;

  const closeButton = document.createElement('button');
  closeButton.innerHTML = '&times;';
  closeButton.style.cssText = `
    position: absolute;
    top: 8px;
    right: 12px;
    border: none;
    background: none;
    font-size: 24px;
    cursor: pointer;
    color: #666;
  `;
  closeButton.onclick = () => onClose();

  const content = document.createElement('div');
  const formDivId = `magicfeedback-form-${surveyId}`;
  content.innerHTML = `
    <div id="${formDivId}" style="margin-top: 12px; width: 100%"></div>
  `;

  // Flags para evitar duplicar eventos
  let surveyCompletedEmitted = false;

  const submitButton = document.createElement('button');
  submitButton.textContent = 'Complete Survey';
  submitButton.style.cssText = `
    background: #4CAF50;
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    margin-top: 16px;
  `;
  submitButton.onclick = () => {
    if (!surveyCompletedEmitted) {
      emit('popup_clicked', surveyId, data);
      emit('survey_completed', surveyId, data);
      surveyCompletedEmitted = true;
    }
    onClose();
  };

  popup.appendChild(closeButton);
  popup.appendChild(content);
  popup.appendChild(submitButton);

  container.innerHTML = '';
  container.appendChild(popup);
  container.style.display = 'flex';

  // Si no hay entorno de navegador, saltar generación (tests / SSR)
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  // Intentar generar el formulario de MagicFeedback dentro del popup
  try {

     // const magicfeedback = await getMagicFeedback();
    // Evitar fallo si lib no expone form
    if (!magicfeedback || typeof magicfeedback.form !== 'function') {
      console.warn('[MagicFeedback] form() no disponible. Se usa fallback manual.');
      return;
    }

    magicfeedback.init({debug: true, env: 'prod'})

    const formInstance = magicfeedback.form(surveyId, productId);
    formInstance.generate(formDivId, {
      addButton: true, // permitir que el propio formulario gestione avance
      getMetaData: true,
      onLoadedEvent: () => {
        emit('popup_clicked', surveyId, data); // primer interacción (carga del formulario)
      },
      onFinishEvent: () => {
        if (!surveyCompletedEmitted) {
          emit('survey_completed', surveyId, data);
          surveyCompletedEmitted = true;
        }
        onClose();
      },
      afterSubmitEvent: ({ progress: _progress, total: _total }: { progress: number; total: number }) => {
        // Hook disponible para futuras métricas (_progress / _total no usados por ahora)
      }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }).catch((err:any) => {
      console.error('[MagicFeedback] Error generating form:', err);
    });
  } catch (e) {
    console.error('[MagicFeedback] Exception initializing form:', e);
  }
}
