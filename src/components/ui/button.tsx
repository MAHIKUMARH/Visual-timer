import * as React from "react"
import { ShaderBackground } from "./a-shader"

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "secondary" | "outline" | "ghost" | "glass" | "destructive"
  size?: "default" | "sm" | "lg" | "icon"
  withShader?: boolean
  theme?: string
  darkMode?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "default",
      withShader = false,
      theme,
      darkMode,
      children,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        className={[
          "fluted-glass-button",
          `btn-${variant}`,
          `btn-size-${size}`,
          withShader && "btn-has-shader",
          className,
        ].filter(Boolean).join(" ")}
        {...props}
      >
        {withShader && (
          <span className="btn-shader-layer" aria-hidden="true">
            <ShaderBackground
              className="btn-shader-canvas"
              theme={theme}
              darkMode={darkMode}
              speed={0.65}
            />
            <span className="btn-shader-shimmer" />
          </span>
        )}
        <span className="btn-content">{children}</span>
      </button>
    )
  },
)

Button.displayName = "Button"
