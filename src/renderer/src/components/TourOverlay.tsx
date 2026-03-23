import { useState, useEffect, useCallback, useRef } from 'react'
import '../assets/tour-overlay.css'

export interface TourStep {
  target: string | null
  title: string
  description: string
  tooltipPosition?: 'bottom' | 'top' | 'right' | 'left'
}

const TOUR_STEPS: TourStep[] = [
  {
    target: null,
    title: 'Welcome to FlowLens',
    description: "Let's take a quick tour of the interface. You'll learn what each panel does and how to trace execution flows."
  },
  {
    target: '[data-tour="timeline"]',
    title: 'Traces',
    description: 'Every click or form submit in your app starts a new trace. All related events — network calls, state changes, console logs — are grouped here.',
    tooltipPosition: 'right'
  },
  {
    target: '[data-tour="trace-group"]',
    title: 'Trace Groups',
    description: 'Each trace is collapsible. Use the focus button (\u25b6) to follow the execution flow step by step, or the details button (\u2026) to inspect raw event data.',
    tooltipPosition: 'right'
  },
  {
    target: '[data-tour="source-panel"]',
    title: 'Source Code',
    description: 'Source code is displayed here with highlighted lines showing where events fired. When you focus a trace, the panel updates as you step through each event.',
    tooltipPosition: 'left'
  },
  {
    target: '[data-tour="bottom-panel"]',
    title: 'Console',
    description: 'Console output from the traced app appears here — logs, warnings, and errors — filterable by level.',
    tooltipPosition: 'top'
  },
  {
    target: '[data-tour="bottom-panel"]',
    title: 'Inspector',
    description: 'The Inspector tab shows React state changes and network request/response details. Click any entry to jump to its related event in the timeline.',
    tooltipPosition: 'top'
  },
  {
    target: null,
    title: "You're all set",
    description: 'Paste a URL to start tracing. FlowLens will capture every interaction, network call, and state change — zero code changes required.'
  }
]

interface SpotlightRect {
  top: number
  left: number
  width: number
  height: number
}

interface TourOverlayProps {
  onComplete: () => void
  onStepChange?: (stepIndex: number) => void
}

export function TourOverlay({ onComplete, onStepChange }: TourOverlayProps) {
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<SpotlightRect | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [tooltipKey, setTooltipKey] = useState(0)

  const currentStep = TOUR_STEPS[step]
  const totalSteps = TOUR_STEPS.length
  const isFullscreen = currentStep.target === null

  const updateRect = useCallback(() => {
    if (!currentStep.target) {
      setRect(null)
      return
    }
    const el = document.querySelector(currentStep.target)
    if (!el) {
      setRect(null)
      return
    }
    const r = el.getBoundingClientRect()
    const pad = 6
    setRect({
      top: r.top - pad,
      left: r.left - pad,
      width: r.width + pad * 2,
      height: r.height + pad * 2
    })
  }, [currentStep.target])

  useEffect(() => {
    updateRect()
    window.addEventListener('resize', updateRect)
    return () => window.removeEventListener('resize', updateRect)
  }, [updateRect])

  const goTo = useCallback(
    (nextStep: number) => {
      setStep(nextStep)
      setTooltipKey((k) => k + 1)
      onStepChange?.(nextStep)
    },
    [onStepChange]
  )

  const handleNext = useCallback(() => {
    if (step < totalSteps - 1) {
      goTo(step + 1)
    } else {
      onComplete()
    }
  }, [step, totalSteps, goTo, onComplete])

  const handleBack = useCallback(() => {
    if (step > 0) goTo(step - 1)
  }, [step, goTo])

  const handleSkip = useCallback(() => {
    onComplete()
  }, [onComplete])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault()
        handleNext()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        handleBack()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        handleSkip()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [handleNext, handleBack, handleSkip])

  const getTooltipStyle = (): React.CSSProperties => {
    if (!rect) return {}
    const pos = currentStep.tooltipPosition ?? 'bottom'
    const gap = 14
    const tooltipW = 340
    const margin = 12
    const maxLeft = window.innerWidth - tooltipW - margin
    const vertCenter = Math.max(margin, Math.min(rect.top + rect.height / 2 - 100, window.innerHeight - 260))

    switch (pos) {
      case 'right':
        return {
          top: vertCenter,
          left: Math.min(maxLeft, rect.left + rect.width + gap)
        }
      case 'left':
        return {
          top: vertCenter,
          left: Math.max(margin, rect.left - tooltipW - gap)
        }
      case 'top':
        return {
          top: Math.max(margin, rect.top - gap),
          left: Math.max(margin, Math.min(maxLeft, rect.left + rect.width / 2 - tooltipW / 2)),
          transform: 'translateY(-100%)'
        }
      case 'bottom':
      default:
        return {
          top: rect.top + rect.height + gap,
          left: Math.max(margin, Math.min(maxLeft, rect.left + rect.width / 2 - tooltipW / 2))
        }
    }
  }

  if (isFullscreen) {
    const isWelcome = step === 0
    const isFinish = step === totalSteps - 1
    return (
      <div className="tour-fullscreen">
        <div className="tour-card">
          <h2 className="tour-card-title">
            {isWelcome ? (
              <>
                Welcome to <span>Flow</span>Lens
              </>
            ) : (
              <>
                You&rsquo;re <span>all set</span>
              </>
            )}
          </h2>
          <p className="tour-card-desc">{currentStep.description}</p>
          <div className="tour-dots" style={{ margin: '4px 0' }}>
            {TOUR_STEPS.map((_, i) => (
              <span
                key={i}
                className={`tour-dot${i === step ? ' active' : i < step ? ' completed' : ''}`}
              />
            ))}
          </div>
          {isWelcome && (
            <>
              <button className="tour-card-btn" onClick={handleNext}>
                Start Tour
              </button>
              <button className="tour-btn-skip" onClick={handleSkip}>
                Skip
              </button>
            </>
          )}
          {isFinish && (
            <>
              <button className="tour-card-btn" onClick={onComplete}>
                Get Started
              </button>
              <button className="tour-btn-skip" onClick={handleBack}>
                &larr; Back
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="tour-backdrop" onClick={(e) => e.stopPropagation()} />
      {rect && (
        <div
          className="tour-spotlight"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height
          }}
        />
      )}
      <div
        ref={tooltipRef}
        key={tooltipKey}
        className="tour-tooltip"
        style={getTooltipStyle()}
      >
        <span className="tour-tooltip-step">
          Step {step} of {totalSteps - 2}
        </span>
        <h3 className="tour-tooltip-title">{currentStep.title}</h3>
        <p className="tour-tooltip-desc">{currentStep.description}</p>
        <div className="tour-tooltip-controls">
          <button className="tour-btn-skip" onClick={handleSkip}>
            Skip tour
          </button>
          <div className="tour-dots">
            {TOUR_STEPS.slice(1, -1).map((_, i) => (
              <span
                key={i}
                className={`tour-dot${i + 1 === step ? ' active' : i + 1 < step ? ' completed' : ''}`}
              />
            ))}
          </div>
          <div className="tour-nav-right">
            {step > 1 && (
              <button className="tour-btn-back" onClick={handleBack}>
                Back
              </button>
            )}
            <button className="tour-btn-next" onClick={handleNext}>
              {step === totalSteps - 2 ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
