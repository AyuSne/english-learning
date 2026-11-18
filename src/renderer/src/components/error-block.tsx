/**
 * 页面级错误块：一句人话 + 一个下一步动作。
 * 字段级小错仍贴在字段下面，不用这一块。
 */
export function ErrorBlock({
  message,
  actionLabel = '再试一次',
  onAction,
  className
}: {
  message: string
  actionLabel?: string
  onAction?: (() => void) | null
  className?: string
}) {
  return (
    <div className={className === undefined ? 'error-block' : `error-block ${className}`} role="alert">
      <p className="error-block-message">{message}</p>
      {onAction === undefined || onAction === null ? null : (
        <button type="button" className="button button-small" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  )
}
