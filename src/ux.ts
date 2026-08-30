/**
 * Extensible UX framework — UXComponent interface + UXManager lifecycle.
 * Spec: contracts/ux-component-contract.md, data-model.md (UXComponent).
 * No I/O at import time; initialization is explicit in src/index.ts isMainModule block.
 */

export interface Key {
  name: string;
  ctrl?: boolean;
  shift?: boolean;
  sequence: string;
}

export interface UXComponent {
  readonly id: string;
  wantsInput(line: string, cursor: number): boolean;
  handleKey(key: Key): boolean;
  render(state: unknown): void;
  dismiss(): void;
  restore?(line: string, cursor: number): void;
}

/**
 * TTY pre-flight gating helper (FR-013). Returns true only when autocomplete
 * should be wired. When false, zero autocomplete wiring occurs (contract Fallback).
 */
export function isAutocompleteEnabled(): boolean {
  return Boolean(process.stdout.isTTY && process.stdin.isTTY);
}

export class UXManager {
  private registry: UXComponent[] = [];
  private active: UXComponent | null = null;
  private disabled = new Set<string>();

  register(component: UXComponent): void {
    if (this.disabled.has(component.id)) return;
    if (this.registry.some((c) => c.id === component.id)) return;
    this.registry.push(component);
  }

  activate(component: UXComponent): void {
    if (this.disabled.has(component.id)) return;
    if (this.active === component) return;
    try {
      if (this.active && this.active !== component) {
        this.active.dismiss();
      }
    } catch (e) {
      console.error(`Warning: UXManager dismiss failed for ${this.active?.id}: ${(e as Error).message}`);
      if (this.active) this.disabled.add(this.active.id);
    }
    this.active = component;
  }

  deactivate(component: UXComponent): void {
    if (this.active !== component) return;
    try {
      component.dismiss();
    } catch (e) {
      console.error(`Warning: UXManager dismiss failed for ${component.id}: ${(e as Error).message}`);
      this.disabled.add(component.id);
    }
    this.active = null;
    // Probe for restoration (FR-009)
    // The caller should provide current line/cursor if available; however
    // UXManager does not retain line state itself. Deactivate with restore
    // delegates to onLineChange-style probing by searching for a wantInput hit.
    // For simplicity, probing without line seeks first wantsInput component;
    // actual line-aware restore is done by the wiring layer calling tryRestore.
  }

  /**
   * Attempt to restore a previously active component when the occupying
   * component released focus and the buffer still wants input. Called by
   * src/index.ts with current line/cursor after deactivate.
   */
  tryRestore(line: string, cursor: number): void {
    if (this.active !== null) return;
    for (const c of this.registry) {
      if (this.disabled.has(c.id)) continue;
      try {
        if (c.wantsInput(line, cursor)) {
          this.activate(c);
          if (c.restore) {
            try {
              c.restore(line, cursor);
            } catch (e) {
              console.error(`Warning: Autocomplete disabled: ${(e as Error).message}`);
              this.disable(c.id);
            }
          }
          break;
        }
      } catch (e) {
        console.error(`Warning: UXManager wantsInput failed for ${c.id}: ${(e as Error).message}`);
        this.disabled.add(c.id);
      }
    }
  }

  disable(id: string): void {
    if (this.disabled.has(id)) return;
    this.disabled.add(id);
    if (this.active?.id === id) {
      try {
        this.active.dismiss();
      } catch (e) {
        console.error(`Warning: UXManager dismiss failed for ${id}: ${(e as Error).message}`);
      }
      this.active = null;
    }
    console.error(`Warning: Autocomplete disabled: component ${id} disabled`);
  }

  isDisabled(id: string): boolean {
    return this.disabled.has(id);
  }

  getActive(): UXComponent | null {
    return this.active;
  }

  onKeypress(key: Key, line: string, cursor: number): boolean {
    try {
      if (this.active) {
        return this.active.handleKey(key);
      }
      // Probe registry for a component that wants input
      for (const c of this.registry) {
        if (this.disabled.has(c.id)) continue;
        try {
          if (c.wantsInput(line, cursor)) {
            this.activate(c);
            return c.handleKey(key);
          }
        } catch (e) {
          console.error(`Warning: UXManager wantsInput failed for ${c.id}: ${(e as Error).message}`);
          this.disabled.add(c.id);
        }
      }
      return false;
    } catch (e) {
      console.error(`Warning: Autocomplete disabled: ${(e as Error).message}`);
      if (this.active) this.disable(this.active.id);
      return false;
    }
  }

  onLineChange(line: string, cursor: number): void {
    try {
      if (this.active) {
        let wants = false;
        try {
          wants = this.active.wantsInput(line, cursor);
        } catch (e) {
          console.error(`Warning: Autocomplete disabled: ${(e as Error).message}`);
          this.disable(this.active.id);
          return;
        }
        if (!wants) {
          try {
            this.active.dismiss();
          } catch (e) {
            console.error(`Warning: Autocomplete disabled: ${(e as Error).message}`);
            if (this.active) this.disabled.add(this.active.id);
          }
          this.active = null;
          // Probe for newly eligible component
          for (const c of this.registry) {
            if (this.disabled.has(c.id)) continue;
            try {
              if (c.wantsInput(line, cursor)) {
                this.activate(c);
                break;
              }
            } catch {}
          }
          return;
        }
        // Active still wants input — rendering is delegated to the component's
        // own debounced render path; UXManager does not call render here.
        return;
      }
      // No active — probe
      for (const c of this.registry) {
        if (this.disabled.has(c.id)) continue;
        try {
          if (c.wantsInput(line, cursor)) {
            this.activate(c);
            break;
          }
        } catch {}
      }
    } catch (e) {
      console.error(`Warning: Autocomplete disabled: ${(e as Error).message}`);
      if (this.active) this.disable(this.active.id);
    }
  }

  onResize(): void {
    if (!this.active) return;
    if (this.disabled.has(this.active.id)) return;
    try {
      this.active.render(undefined);
    } catch (e) {
      console.error(`Warning: Autocomplete disabled: ${(e as Error).message}`);
      if (this.active) this.disable(this.active.id);
    }
  }
}
