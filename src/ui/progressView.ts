/**
 * Qué pinta la barra de progreso del popup. Espejo de `src/utils/progress.ts` de MagicSurvey y
 * de `ProgressBarState.kt` del SDK nativo: mismas reglas en los tres clientes.
 *
 * `progress` es lo que da el SDK del survey: posición (desde 0) de la página en pantalla sobre
 * el camino más largo; una follow-up abierta suma 0.5. `total` es el camino más largo.
 *
 * - `current` (por defecto, hoy): la pregunta en la que está ("Question 3 of 5", 60 %). La
 *   barra usa el valor real (la follow-up avanza media casilla) y la etiqueta redondea hacia
 *   abajo. Oculta en la pantalla final.
 * - `completed` (DD-210): las preguntas ya respondidas ("2 of 5 answered", 40 %). La follow-up
 *   abierta no la mueve. En la pantalla final sale al 100 % ("N of N answered").
 */
export type ProgressMode = 'current' | 'completed';

export type ProgressViewInput = {
    progress: number;
    total: number;
    completed?: boolean;
    mode?: string | null;
    unit?: string | null;
};

export type ProgressView = {
    visible: boolean;
    /** 0..100 */
    percent: number;
    /** Texto en negrita ("Question 3", "40%", "2 of 5 answered"). */
    current: string;
    /** Texto en gris detrás (" of 5"); vacío si no hay. */
    rest: string;
};

type Labels = { question: string; of: string; answeredOf: string };

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function fillAnswered(template: string, answered: number, total: number): string {
    return template.split('{answered}').join(String(answered)).split('{total}').join(String(total));
}

export function progressView(input: ProgressViewInput, labels: Labels): ProgressView {
    const total = input.total;
    const progress = input.progress;
    const percentage = input.unit === 'percentage';
    if (total <= 1) return { visible: false, percent: 0, current: '', rest: '' };

    if (input.mode !== 'completed') {
        if (input.completed) return { visible: false, percent: 0, current: '', rest: '' };
        const current = clamp(progress + 1, 1, total);
        const percent = clamp((current / total) * 100, 0, 100);
        if (percentage) return { visible: true, percent, current: `${Math.round(percent)}%`, rest: '' };
        const label = clamp(Math.floor(progress) + 1, 1, total);
        return { visible: true, percent, current: `${labels.question} ${label}`, rest: ` ${labels.of} ${total}` };
    }

    // En la pantalla final la página en pantalla también se envió, y el total pasa a ser lo
    // respondido (una rama puede haber saltado páginas): siempre acaba en "N of N".
    const answered = input.completed
        ? clamp(Math.floor(progress) + 1, 1, total)
        : clamp(Math.floor(progress), 0, total);
    const shownTotal = input.completed ? answered : total;
    const percent = input.completed ? 100 : clamp((answered / total) * 100, 0, 100);
    if (percentage) return { visible: true, percent, current: `${Math.round(percent)}%`, rest: '' };
    return { visible: true, percent, current: fillAnswered(labels.answeredOf, answered, shownTotal), rest: '' };
}

/**
 * Espejo ES5 de `progressView` para el JS de dentro del WebView de RN (`surveyHtml.ts`), donde
 * no hay módulos. `progressView.test.ts` lo evalúa y lo compara con la versión TS.
 * Define `ddProgressView(input, labels)`.
 */
export const PROGRESS_VIEW_JS = `
function ddProgressView(input, labels){
  function clamp(n,a,b){ return Math.min(b,Math.max(a,n)); }
  function fill(t,a,n){ return String(t).split('{answered}').join(String(a)).split('{total}').join(String(n)); }
  var total=input.total, progress=input.progress, pctUnit=input.unit==='percentage';
  if(total<=1){ return {visible:false,percent:0,current:'',rest:''}; }
  if(input.mode!=='completed'){
    if(input.completed){ return {visible:false,percent:0,current:'',rest:''}; }
    var cur=clamp(progress+1,1,total);
    var pct=clamp((cur/total)*100,0,100);
    if(pctUnit){ return {visible:true,percent:pct,current:Math.round(pct)+'%',rest:''}; }
    var lab=clamp(Math.floor(progress)+1,1,total);
    return {visible:true,percent:pct,current:labels.question+' '+lab,rest:' '+labels.of+' '+total};
  }
  var answered=input.completed ? clamp(Math.floor(progress)+1,1,total) : clamp(Math.floor(progress),0,total);
  var shown=input.completed ? answered : total;
  var p2=input.completed ? 100 : clamp((answered/total)*100,0,100);
  if(pctUnit){ return {visible:true,percent:p2,current:Math.round(p2)+'%',rest:''}; }
  return {visible:true,percent:p2,current:fill(labels.answeredOf,answered,shown),rest:''};
}
`;
