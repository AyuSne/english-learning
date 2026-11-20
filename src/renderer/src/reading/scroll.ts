/**
 * 把阅读正文里的定位目标滚到容器上方三分之一处。
 * 从词条回原文与从全局搜索落到段落/句子共用这一条落点公式，
 * 两处不再各写一份，改动也不会只改一处。
 */
export function scrollTargetIntoReading(
  container: HTMLElement,
  target: HTMLElement
): void {
  const offset =
    target.getBoundingClientRect().top -
    container.getBoundingClientRect().top -
    container.clientHeight / 3
  container.scrollTop = Math.max(0, container.scrollTop + offset)
}
