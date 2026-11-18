/**
 * 文件名里的时间戳：本地时间，按可排序的紧凑写法（20261118-1130）。
 * 备份文件与线程导出都用它，同一秒内的重名由调用方自己再区分。
 */
export function fileStamp(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(
    date.getHours()
  )}${pad(date.getMinutes())}`
}
