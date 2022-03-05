

export const dataURLtoBlob = (dataurl: string) => {
  const arr: any[] = dataurl.split(',')
  const mime = arr[0]!.match(/:(.*?);/)[1]
  const bstr = atob(arr[1])
  let n = bstr.length
  const u8arr = new Uint8Array(n)
  while (n--) { // eslint-disable-line
    u8arr[n] = bstr.charCodeAt(n)
  }
  return new Blob([u8arr], { type: mime })
}

export const BolbToFile = (blob: BlobPart, name: string, mime: string) => {
  const file = new File([blob], name, {
    type: mime,
  })
  return file
}

export const downFile = (type: string, data: any, fileName = '') => {
  if (type === 'link') {
    const link = document.createElement('a')
    link.href = data
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    window.URL.revokeObjectURL(link.href)
    document.body.removeChild(link)
  } else {
    const link = document.createElement('a')
    link.href = window.URL.createObjectURL(data)
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    window.URL.revokeObjectURL(link.href)
    document.body.removeChild(link)
  }
}
