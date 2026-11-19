import { formatMoment } from '../settings/format'

/** 学习指令列表里的更新时间；坏值不假装成时间。 */
export function instructionUpdatedText(iso: string): string {
  const moment = formatMoment(iso)
  return moment === '' ? '' : `更新于 ${moment}`
}
