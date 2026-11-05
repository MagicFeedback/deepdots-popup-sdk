/**
 * Tiempo de ejecución en segundo plano para los envíos de analytics (DD-55).
 *
 * En iOS la app se suspende pocos segundos después de pasar a background. Si el POST con el
 * cierre de la sesión sigue en vuelo, no termina hasta que el usuario vuelve a abrir la app
 * (medido en producción con React Native, nov 2026: una de cada tres sesiones iOS se cerraba tarde o nunca, frente
 * a ~2 % en Android). iOS concede más tiempo si la app lo pide (`beginBackgroundTask`), pero
 * eso es una API nativa: el SDK es JS puro, así que el host le pasa una función que la abre.
 *
 * Contrato (igual que `beginBackgroundTask` del SDK nativo): `begin(name)` abre una tarea y
 * devuelve la función que la cierra. Puede llamarse varias veces a la vez.
 */
export type BackgroundTaskRunner = (name: string) => () => void;

/**
 * Techo de una tarea abierta por el SDK. iOS da ~30 s; el POST ya se da por fallido a los
 * 20 s (`POST_TIMEOUT_MS`), así que esto solo cubre un `end` que no llegue nunca.
 */
export const BACKGROUND_TASK_MAX_MS = 25_000;

/**
 * Ejecuta `work` dentro de una tarea de background y la cierra al terminar (bien o mal) o al
 * llegar a `maxMs`, lo que pase antes, y una sola vez. Sin `begin`, o si `begin` falla, ejecuta
 * `work` sin más: la tarea es una ayuda, nunca un requisito para enviar.
 */
export async function runInBackgroundTask<T>(
  begin: BackgroundTaskRunner | undefined,
  name: string,
  work: () => Promise<T>,
  maxMs: number = BACKGROUND_TASK_MAX_MS,
): Promise<T> {
  let end: (() => void) | undefined;
  try {
    end = begin?.(name);
  } catch {
    end = undefined;
  }
  if (typeof end !== 'function') return work();

  let ended = false;
  const finish = () => {
    if (ended) return;
    ended = true;
    clearTimeout(timer);
    try {
      end!();
    } catch {
      /* cerrar la tarea no puede romper el envío */
    }
  };
  const timer = setTimeout(finish, maxMs);
  try {
    return await work();
  } finally {
    finish();
  }
}

/** Forma mínima de `react-native-background-timer` (`BackgroundTimer` por defecto). */
export interface BackgroundTimerLike {
  start(delay?: number): unknown;
  stop(): unknown;
}

/**
 * Adaptador sobre `react-native-background-timer`. En iOS su `start()` abre UNA background
 * task (`beginBackgroundTaskWithName`, y cierra la anterior) y `stop()` la cierra, así que aquí
 * se cuentan las tareas abiertas: `start` con la primera y `stop` cuando se cierra la última.
 *
 * Úsalo solo en iOS: en Android `start()` toma un wakelock (permiso `WAKE_LOCK`) que no hace
 * falta, porque Android no suspende la app al pasar a background.
 */
export function backgroundTimerTask(timer: BackgroundTimerLike): BackgroundTaskRunner {
  let open = 0;
  return () => {
    if (open === 0) timer.start(0);
    open++;
    let closed = false;
    return () => {
      if (closed) return;
      closed = true;
      open--;
      if (open === 0) timer.stop();
    };
  };
}
