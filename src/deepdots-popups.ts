import {
  DeepdotsConfig,
  TriggerConfig,
  ShowOptions,
  DeepdotsEvent,
  DeepdotsEventType,
  EventListener,
} from './types';

/**
 * Main class for managing survey popups
 */
export class DeepdotsPopups {
  private config: DeepdotsConfig | null = null;
  private listeners: Map<DeepdotsEventType, Set<EventListener>> = new Map();
  private triggers: TriggerConfig[] = [];
  private initialized = false;
  private popupContainer: HTMLElement | null = null;

  /**
   * Initialize the SDK with configuration
   */
  init(config: DeepdotsConfig): void {
    if (this.initialized) {
      this.log('SDK already initialized');
      return;
    }

    this.config = {
      baseUrl: 'https://api.magicfeedback.com',
      debug: false,
      ...config,
    };

    this.initialized = true;
    this.log('SDK initialized', this.config);
    this.setupPopupContainer();
  }

  /**
   * Enable auto-launch functionality with configured triggers
   */
  autoLaunch(): void {
    if (!this.initialized) {
      throw new Error('SDK not initialized. Call init() first.');
    }

    this.log('Auto-launch enabled');
    this.triggers.forEach((trigger) => {
      this.setupTrigger(trigger);
    });
  }

  /**
   * Show a popup immediately
   */
  show(options: ShowOptions): void {
    if (!this.initialized) {
      throw new Error('SDK not initialized. Call init() first.');
    }

    this.log('Showing popup', options);
    this.renderPopup(options.surveyId, options.data);
    this.emitEvent('popup_shown', options.surveyId, options.data);
  }

  /**
   * Configure triggers for auto-launching popups
   */
  configureTriggers(triggers: TriggerConfig[]): void {
    if (!this.initialized) {
      throw new Error('SDK not initialized. Call init() first.');
    }

    this.triggers = triggers;
    this.log('Triggers configured', triggers);
  }

  /**
   * Add an event listener
   */
  on(eventType: DeepdotsEventType, listener: EventListener): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(listener);
  }

  /**
   * Remove an event listener
   */
  off(eventType: DeepdotsEventType, listener: EventListener): void {
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  /**
   * Setup popup container element
   */
  private setupPopupContainer(): void {
    if (typeof document === 'undefined') {
      return;
    }

    this.popupContainer = document.createElement('div');
    this.popupContainer.id = 'deepdots-popup-container';
    this.popupContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: none;
      z-index: 999999;
      background: rgba(0, 0, 0, 0.5);
      justify-content: center;
      align-items: center;
    `;
    document.body.appendChild(this.popupContainer);
  }

  /**
   * Render the popup UI
   */
  private renderPopup(surveyId: string, data?: Record<string, unknown>): void {
    if (!this.popupContainer) {
      return;
    }

    const popup = document.createElement('div');
    popup.className = 'deepdots-popup';
    popup.style.cssText = `
      background: white;
      border-radius: 8px;
      padding: 24px;
      max-width: 500px;
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
    closeButton.onclick = () => this.hidePopup();

    const content = document.createElement('div');
    content.innerHTML = `
      <h2 style="margin-top: 0; color: #333;">Survey</h2>
      <p style="color: #666;">Survey ID: ${surveyId}</p>
      <p style="color: #666;">This is a placeholder for the actual survey content.</p>
      ${data ? `<pre style="background: #f5f5f5; padding: 12px; border-radius: 4px; overflow: auto;">${JSON.stringify(data, null, 2)}</pre>` : ''}
    `;

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
      this.emitEvent('popup_clicked', surveyId, data);
      this.emitEvent('survey_completed', surveyId, data);
      this.hidePopup();
    };

    popup.appendChild(closeButton);
    popup.appendChild(content);
    popup.appendChild(submitButton);

    this.popupContainer.innerHTML = '';
    this.popupContainer.appendChild(popup);
    this.popupContainer.style.display = 'flex';
  }

  /**
   * Hide the popup
   */
  private hidePopup(): void {
    if (this.popupContainer) {
      this.popupContainer.style.display = 'none';
      this.popupContainer.innerHTML = '';
    }
  }

  /**
   * Setup a trigger
   */
  private setupTrigger(trigger: TriggerConfig): void {
    switch (trigger.type) {
      case 'time':
        this.setupTimeTrigger(trigger);
        break;
      case 'scroll':
        this.setupScrollTrigger(trigger);
        break;
      case 'exit':
        this.setupExitTrigger(trigger);
        break;
    }
  }

  /**
   * Setup time-based trigger
   */
  private setupTimeTrigger(trigger: TriggerConfig): void {
    const delay = trigger.value || 5000;
    setTimeout(() => {
      this.show({ surveyId: trigger.surveyId });
    }, delay);
    this.log(`Time trigger set for ${delay}ms`);
  }

  /**
   * Setup scroll-based trigger
   */
  private setupScrollTrigger(trigger: TriggerConfig): void {
    const threshold = trigger.value || 50;
    const handler = () => {
      const scrollPercentage = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
      if (scrollPercentage >= threshold) {
        this.show({ surveyId: trigger.surveyId });
        window.removeEventListener('scroll', handler);
      }
    };
    window.addEventListener('scroll', handler);
    this.log(`Scroll trigger set for ${threshold}%`);
  }

  /**
   * Setup exit intent trigger
   */
  private setupExitTrigger(trigger: TriggerConfig): void {
    const handler = (e: MouseEvent) => {
      if (e.clientY <= 0) {
        this.show({ surveyId: trigger.surveyId });
        document.removeEventListener('mouseout', handler);
      }
    };
    document.addEventListener('mouseout', handler);
    this.log('Exit intent trigger set');
  }

  /**
   * Emit an event
   */
  private emitEvent(
    type: DeepdotsEventType,
    surveyId: string,
    data?: Record<string, unknown>
  ): void {
    const event: DeepdotsEvent = {
      type,
      surveyId,
      timestamp: Date.now(),
      data,
    };

    this.log('Event emitted', event);

    const listeners = this.listeners.get(type);
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          listener(event);
        } catch (error) {
          console.error('Error in event listener:', error);
        }
      });
    }
  }

  /**
   * Log debug messages
   */
  private log(...args: unknown[]): void {
    if (this.config?.debug) {
      console.log('[DeepdotsPopups]', ...args);
    }
  }
}
