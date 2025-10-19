// Types
export interface NavigateOptions {
  scroll?: boolean
  shallow?: boolean
  replace?: boolean // Use replaceState instead of pushState
}

export interface RouterState {
  pathname: string
  searchParams: URLSearchParams
  hash: string
}

// SSR hydration state
declare global {
  interface Window {
    __ROUTER_STATE__?: RouterState
  }
}

export class ClientRouter {
  private listeners: Set<() => void> = new Set()
  private state: RouterState
  private isProgrammaticNavigation = false
  private supportsViewTransitions: boolean
  private lastNavigationTime = 0
  private navigationDebounceMs = 10 // Prevent double-tap navigation

  constructor() {
    // SSR hydration: Use server state if available
    this.state =
      typeof window !== "undefined" && window.__ROUTER_STATE__
        ? window.__ROUTER_STATE__
        : this.getCurrentState()

    // Cache View Transitions API support check
    this.supportsViewTransitions =
      typeof document !== "undefined" && "startViewTransition" in document

    // Log support status for debugging
    if (typeof window !== "undefined") {
      console.log(
        "🌶️ Pepper Router: View Transitions supported:",
        this.supportsViewTransitions,
      )
    }

    if (typeof window === "undefined") return
    // Listen to browser navigation events (passive for better performance)
    window.addEventListener("popstate", this.handlePopState, { passive: true })
    window.addEventListener("hashchange", this.handleHashChange, {
      passive: true,
    })
  }

  private getCurrentState(): RouterState {
    if (typeof window === "undefined") {
      return {
        pathname: "",
        searchParams: new URLSearchParams(),
        hash: "",
      }
    }
    const url = new URL(window.location.href)
    return {
      pathname: url.pathname,
      searchParams: url.searchParams,
      hash: url.hash,
    }
  }

  private handlePopState = () => {
    // Ignore popstate during programmatic navigation
    if (this.isProgrammaticNavigation) {
      return
    }
    this.state = this.getCurrentState()
    this.notifyListeners()
  }

  private handleHashChange = () => {
    this.state = this.getCurrentState()
    this.notifyListeners()
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => listener())
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  push(href: string, options: NavigateOptions = {}) {
    if (typeof window === "undefined") return

    // Debounce: Prevent double navigation (mobile double-tap)
    const now = Date.now()
    if (now - this.lastNavigationTime < this.navigationDebounceMs) {
      console.log("🌶️ Navigation debounced (double-tap prevented)")
      return
    }
    this.lastNavigationTime = now

    this.isProgrammaticNavigation = true
    const url = new URL(href, window.location.origin)

    const performNavigation = () => {
      // Support both push and replace
      if (options.replace) {
        window.history.replaceState({}, "", url.toString())
      } else {
        window.history.pushState({}, "", url.toString())
      }

      this.state = this.getCurrentState()

      if (options.scroll !== false) {
        window.scrollTo(0, 0)
      }

      this.notifyListeners()

      // Use queueMicrotask for better performance than setTimeout
      queueMicrotask(() => {
        this.isProgrammaticNavigation = false
      })
    }

    // Use cached View Transitions API check
    if (this.supportsViewTransitions && !options.shallow) {
      console.log("🌶️ Using View Transition for navigation to:", href)
      document.startViewTransition(performNavigation)
    } else {
      console.log("🌶️ Direct navigation (no transition) to:", href)
      performNavigation()
    }
  }

  replace(href: string, options: NavigateOptions = {}) {
    // Delegate to push with replace option
    this.push(href, { ...options, replace: true })
  }

  /**
   * Prefetch a route to warm up the cache
   * Useful for hover/focus prefetching
   */
  prefetch(url: string) {
    if (typeof window === "undefined") return

    try {
      // HEAD request to warm up cache without downloading full content
      fetch(url, { method: "HEAD", mode: "no-cors" }).catch(() => {
        // Silently fail - prefetch is a hint, not critical
      })
    } catch {
      // Ignore prefetch errors
    }
  }

  /**
   * Get current router state (useful for SSR hydration)
   */
  getState(): RouterState {
    return this.state
  }

  refresh() {
    if (typeof window === "undefined") return
    // Force refresh by updating state and notifying listeners
    this.state = this.getCurrentState()
    this.notifyListeners()
    // Scroll to top on refresh
    window.scrollTo(0, 0)
  }

  back() {
    if (typeof window === "undefined") return
    window.history.back()
  }

  forward() {
    if (typeof window === "undefined") return
    window.history.forward()
  }

  destroy() {
    if (typeof window === "undefined") return
    window.removeEventListener("popstate", this.handlePopState)
    window.removeEventListener("hashchange", this.handleHashChange)
    this.listeners.clear()
  }

  // Get cached View Transitions support status
  hasViewTransitions() {
    return this.supportsViewTransitions
  }
}

// Create singleton instance
export const clientRouter = new ClientRouter()
