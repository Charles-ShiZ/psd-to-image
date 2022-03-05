import React, {
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  Paper,
  TextField,
  IconButton,
  Grid,
  Button,
} from '@material-ui/core'
import {
  dataURLtoBlob, BolbToFile, downFile,
} from './utils'
import Konva from 'konva'
import {
  CloudUpload,
} from '@material-ui/icons'
import PSD from 'psd.js'
import { produce } from 'immer'
import { Buffer } from "buffer";

window.Buffer = Buffer

const groupNodes = (nodes) => {
  let currentGroup = []
  const groupedNodes = [currentGroup]

  let clippingMaskName

  const createNewGroup = () => {
    currentGroup = []
    groupedNodes.push(currentGroup)
  }

  nodes.forEach((node) => {
    const clipEle = node.clippingMask()
    // 考虑多个元素共用一个 clippingMask 的情况
    if (clipEle && clippingMaskName !== clipEle.get('name')) {
      clippingMaskName = clipEle.get('name')
      createNewGroup()
      return currentGroup.push(node)
    }

    if (node.get('name') === clippingMaskName) {
      currentGroup.push(node)
      createNewGroup()
      return false
    }
    currentGroup.push(node)
    return false
  })
  return groupedNodes
}
function fileToBase64Promise(file, noHead) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => {
      if (noHead) { resolve(reader.result.replace(/^data:(.*)base64,/, '')) } else { resolve(reader.result) }
    }
    reader.onerror = (e) => reject(e)
  })
}

async function fileToBase64(file, noHead) {
  const base64 = await fileToBase64Promise(file, noHead)
  return base64
}

export default function PsdImageGenerate({ psdUrl }) {
  const container = useRef(null)
  const konvajsContent = useRef(null)
  const konvajsCanvas = useRef(null)
  // const initialKonvaStage = useRef(null)
  const currentKonvaStage = useRef(null)
  const currentPsdParsedData = useRef(null)
  // const [prevKonvaStages, setPrevKonvaStages] = useState([])
  const [formData, setFormData] = useState({})
  const { texts = [], images = [] } = formData

  const parsePsd = async () => {
    // psd1: "https://file.ltwebstatic.com/cmpfile/product/0984D23A307F4796A797ED9553120302.psd"
    // psd2: "https://file.ltwebstatic.com/cmpfile/product/973DBB4CE416433281DCE00CE2B34A42.psd"
    const file = await PSD.fromURL(psdUrl)
    const width = file.image.width()
    const height = file.image.height()
    const aspectRatio = height / width // 宽高比
    const nodes = file.tree().descendants()
    const exportLayers = file.tree().export().children
    return {
      file,
      width,
      height,
      aspectRatio,
      nodes,
      exportLayers,
    }
  }
  const cachePsdParsedData = (psd) => {
    if (currentPsdParsedData.current) return currentPsdParsedData.current

    const {
      width, height, aspectRatio, nodes, exportLayers,
    } = psd
    const imageNodes = []
    const textNodes = []
    const reversedNodes = groupNodes(nodes).reverse()
    reversedNodes.forEach(nodeArr => {
      nodeArr.reverse().forEach(node => {
        if (node.get('typeTool')) {
          const [textLayer] = exportLayers.filter((item) => item.name === node.get('name'))
          const textScale = textLayer.text.transform.xx
          const typeTool = node.get('typeTool')
          const styleRunArray = typeTool.engineData.EngineDict.StyleRun.RunArray[1] || typeTool.engineData.EngineDict.StyleRun.RunArray[0]
          const styleSheetData = styleRunArray.StyleSheet.StyleSheetData
          const fontSize = Math.round(styleSheetData.FontSize * textScale)
          const fontColor = `rgba(${(typeTool.colors()[1] || typeTool.colors()[0]).join(', ')})`
          const nodeData = {
            text: styleSheetData.FontCaps === 2 ? typeTool.textValue.toUpperCase() : typeTool.textValue,
            fontFamily: typeTool.fonts().join(', '),
            draggable: false,
            fontStyle: styleSheetData.FauxBold ? 'bold' : 'normal',
            fontSize,
            fill: fontColor,
            align: typeTool.alignment(),
            listening: true,
            typeTool,
            get(key) {
              return {
                name: node.get('name'),
                top: node.get('top'),
                left: node.get('left'),
                width: node.width,
                height: node.height,
                typeTool,
              }[key]
            },
          }
          textNodes.push(nodeData)
        } else {
          const nodeData = {
            id: `layer${+new Date()}`,
            y: node.get('top'),
            x: node.get('left'),
            draggable: false,
            listening: false,
            get(key) {
              return {
                name: node.get('name'),
                top: node.get('top'),
                left: node.get('left'),
                width: node.width,
                height: node.height,
              }[key]
            },
            layer: {
              image: {
                base64: node.layer.image.toBase64(),
                toBase64() {
                  return node.layer.image.toBase64()
                },
              },
              visible: node.layer.visible,
            },
            type: node.type,
          }
          imageNodes.push(nodeData)
        }
      })
    })
    const resolved = {
      width, height, aspectRatio, nodes, exportLayers, imageNodes, textNodes, modified: false,
    }
    currentPsdParsedData.current = resolved
    setFormData({
      texts: textNodes.map(node => ({
        label: node.get('name'),
        value: node.text,
      })),
      images: imageNodes.map(node => ({
        label: node.get('name'),
        value: node.layer.image.toBase64(),
      })),
    })
    return resolved
  }
  const showImage = async function () {
    const containerCurrent = container.current
    if (!containerCurrent || !currentPsdParsedData.current) return false
    const containerWidth = containerCurrent.offsetWidth
    const {
      width: psdWidth, height: psdHeight, aspectRatio, imageNodes, textNodes,
    } = currentPsdParsedData.current

    const scale = containerWidth / psdWidth

    // 创建一个场景
    const konvaStage = new Konva.Stage({
      container: containerCurrent,
      width: psdWidth,
      height: psdHeight,
      // draggable: true,
      scale: { x: scale, y: scale },
    })
    // 缓存 konvaStage
    currentKonvaStage.current = konvaStage
    // 创建一个层级
    const konvaLayer = new Konva.Layer()
    // 场景添加一个层级
    konvaStage.add(konvaLayer)
    // 创建添加 Transformer 的函数
    const addTransformer = (node) => {
      konvaStage.find('Transformer').destroy()
      const transformer = new Konva.Transformer({
        node,
        centeredScaling: true,
        rotationSnaps: [0, 90, 180, 270],
      })
      konvaLayer.add(transformer)
      konvaStage.draw()
    }
    // 监听 “点击”
    konvaLayer.on('click', (e) => {
      addTransformer(e.target)
      currentPsdParsedData.current.modified = true
    })
    // 监听 “开始拖动”
    konvaLayer.on('dragstart', (e) => {
      addTransformer(e.target)
      currentPsdParsedData.current.modified = true
    })
    // 监听 "拖动结束"
    // konvaLayer.on('dragend', (e) => {
    //   konvaStage.find('Transformer').destroy()
    //   konvaStage.draw()
    // })
    // 改变鼠标样式
    konvaLayer.on('mouseenter', () => {
      konvaStage.container().style.cursor = 'pointer'
    })
    konvaLayer.on('mouseleave', () => {
      konvaStage.container().style.cursor = 'default'
      // konvaStage.find('Transformer').destroy()
      // konvaStage.draw()
    })

    // 渲染图片
    await Promise.all(imageNodes.map(async (node) => {
      if (node.layer.image && node.type !== 'group' && node.layer.visible && node.get('width') > 0 && node.get('height') > 0) {
        const imageBase64 = node.layer.image.base64
        if (imageBase64) {
          const imageNode = await (() => new Promise((resolve) => {
            Konva.Image.fromURL(imageBase64, (res) => resolve(res))
          }))()
          imageNode.setAttrs({
            id: `layer${+new Date()}`,
            y: node.get('top'),
            x: node.get('left'),
            name: node.get('name'),
            draggable: true,
            listening: true,
          })
          konvaLayer.add(imageNode)
        }
      }
    }))

    // 渲染文字
    textNodes.forEach((node) => {
      const textNode = new Konva.Text({
        x: node.get('left'),
        y: node.get('top'),
        text: node.text, // eslint-disable-line
        fontFamily: node.fontFamily,
        draggable: true,
        fontStyle: node.fontSize,
        fontSize: node.fontSize,
        fill: node.fill,
        align: node.align,
        listening: true,
        name: node.get('name'),
      })
      konvaLayer.add(textNode)
    })

    // 添加浮动信息
    // const text = new Konva.Text({
    //   x: 100,
    //   y: 100,
    //   fontFamily: 'Calibri',
    //   fontSize: 24,
    //   text: '231231231234',
    //   fill: 'black',
    // })
    // konvaLayer.add(text)

    const contentDiv = document.getElementsByClassName('konvajs-content')[0]
    const canvas = contentDiv.childNodes[0]
    konvajsContent.current = contentDiv
    konvajsCanvas.current = canvas
    contentDiv.style.overflow = 'hidden'
    // 实时更新 canvas 宽度的回调函数
    const cb = () => {
      const containerWidth = container.current.offsetWidth
      const scale = containerWidth / psdWidth
      konvaStage.scale({ x: scale, y: scale })
      konvaStage.draw()
      contentDiv.style.width = `${containerWidth}px`
      contentDiv.style.height = `${containerWidth * aspectRatio}px`
    }
    cb()

    window.onresize = cb
    return cb
  }
  const updateImage = async () => {
    const currentLayer = currentKonvaStage.current.children[0]
    const layerNodes = currentLayer.children
    const dataObj = (() => {
      const res = {};
      [...texts, ...images].forEach(item => {
        res[item.label] = item.value
      })
      return res
    })()
    await Promise.all(layerNodes.map(async (node) => {
      const newValue = dataObj[node.attrs.name]
      if (node.className === 'Image') {
        const newImg = await (new Promise((res, rej) => {
          const img = new Image()
          img.src = newValue
          img.onload = () => res(img)
          img.onerror = () => rej(img)
        }))
        console.log('234234')
        node.setImage(newImg)
      } else if (node.className === 'Text') {
        node.setAttrs({
          text: newValue,
        })
        node.draw()
      }
    }))
    console.log('1')
    currentLayer.draw()
  }
  const exportImage = () => {
    // 准备工作：清除 Transformer，暂时恢复 psd 的 scale
    const currentKonvaStageCurr = currentKonvaStage.current
    currentKonvaStageCurr.find('Transformer').destroy()
    currentKonvaStageCurr.draw()
    currentKonvaStageCurr.scale({ x: 1, y: 1 })

    // 开始导出合成图
    const dataUrl = currentKonvaStageCurr.toDataURL({
      mimeType: 'image/png',
      quality: 1,
    })
    const fileName = `合成图${+new Date()}`
    const Bolb = dataURLtoBlob(dataUrl)
    const file = BolbToFile(Bolb, fileName, 'image/png')
    const path = (window.URL || window.webkitURL).createObjectURL(file)
    downFile('link', path, fileName)

    // 合成图导出后，改为合适的 scale
    const { width } = currentPsdParsedData.current
    const containerWidth = container.current.offsetWidth
    const scale = containerWidth / width
    currentKonvaStageCurr.scale({ x: scale, y: scale })
    currentKonvaStageCurr.draw()
  }
  const initializeImage = async () => {
    if (currentPsdParsedData.current.modified) {
      await showImage()
      currentPsdParsedData.current.modified = false
    }
  }

  const changeImageMaterial = async (file, key, index) => {
    const fileBase64 = await fileToBase64(file)
    const newFormData = produce(formData, draft => {
      // eslint-disable-next-line no-param-reassign
      draft.images[index].value = fileBase64
    })
    setFormData(newFormData)
  }

  useEffect(() => {
    (async () => {
      // 解析 psd
      const psd = await parsePsd()
      // 缓存已解析的 psd 数据
      cachePsdParsedData(psd)
      // 生成图片
      await showImage()
    })()
  }, [])

  return (
    <Grid
      container
      spacing={3}
      style={{
        width: '100%',
        height: 'calc(100% - 10px)',
        margin: 0,
        backgroundColor: 'white',
      }}
    >
      <Grid
        style={{
          height: '100%',
          overflow: 'scroll',
          padding: 0,
        }}
        item
        xs={3}
      >
        <div
          style={{
            height: 'calc(100% - 50px)',
            overflow: 'scroll',
            padding: 20,
          }}
        >
          <div style={{
            fontSize: '16px',
            fontWeight: '500',
            marginBottom: '10px',
            // display: 'flex',
            alignItems: 'center',
          }}
          >
            选择主图
            <div style={{
              border: '2px solid #226CB9',
              height: '0px',
              flex: '1',
              marginTop: '3px',
            }}
            />
          </div>
          {
            images.length ? images.map(({ label, value }, index) => (
              <Paper
                key={label}
                variant='outlined'
                style={{
                  height: 70,
                  marginBottom: 20,
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{
                  padding: 10,
                  width: 50,
                  flex: 1,
                  fontWeight: 500,
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
                >
                  {label}
                </div>
                <div style={{
                  width: 230,
                  height: '100%',
                  display: 'flex',
                  justifyContent: 'center',
                  borderLeft: '1px dashed #ccc',
                  borderRight: '1px dashed #ccc',
                  overflowY: 'scroll',
                }}
                >
                  <img height='100%' src={value} alt={label} />
                </div>
                <div style={{
                  width: '50px',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
                >
                  <form style={{ display: 'inline-block' }}>
                    <label htmlFor={`fileUpload${index}`}>
                      <input
                        id={`fileUpload${index}`}
                        type='file'
                        multiple={false}
                        accept='.png'
                        value='' // 必须设置为空值，保证 input 不会缓存数据，导致无法连续导入相同文件
                        style={{
                          display: 'none',
                        }}
                        onChange={(e) => {
                          e.preventDefault()
                          const { files } = e.target
                          const [file] = files
                          changeImageMaterial(file, label, index)
                        }}
                      />
                      <IconButton component='span'>
                        <CloudUpload style={{ color: '#2196f3' }} />
                      </IconButton>
                    </label>
                  </form>
                </div>
              </Paper>
            )) : <div style={{ height: 200 }} />
          }
          <div style={{
            fontSize: '16px',
            fontWeight: '500',
            marginBottom: '10px',
            // display: 'flex',
            alignItems: 'center',
          }}
          >
            填写文案
            <div style={{
              border: '2px solid #226CB9',
              height: '0px',
              flex: '1',
              marginTop: '3px',
            }}
            />
          </div>
          <Paper
            variant='outlined'
            style={{
              padding: 10,
              marginBottom: 20,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {
              texts.length ? texts.map(({ label, value }, index) => (
                <TextField
                  color='secondary'
                  key={label}
                  style={{ marginBottom: 20 }}
                  label={label}
                  value={value}
                  onChange={(e) => {
                    const newFormData = produce(formData, draft => {
                      // eslint-disable-next-line no-param-reassign
                      draft.texts[index].value = e.target.value
                    })
                    setFormData(newFormData)
                  }}
                />
              )) : <div style={{ height: 300 }} />
            }
          </Paper>
        </div>
        <div style={{
          height: 50,
          display: 'flex',
          justifyContent: 'center',
        }}
        >
          <Button
            color='secondary'
            variant='outlined'
            style={{ width: 200, height: 35 }}
            onClick={updateImage}
          >
            更新图片
          </Button>
        </div>
      </Grid>
      <Grid
        item
        xs={9}
        style={{
          padding: 10,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Paper
          variant='outlined'
          square
          style={{
            padding: 10,
            width: '100%',
            display: 'flex',
            height: JSON.stringify(formData) === '{}' ? 500 : '',
            alignItems: 'center',
            marginBottom: '20px',
          }}
        >
          <div
            ref={container}
            style={{
              width: '100%',
              height: '100%',
            }}
          />
          {/* <img width='100%' src='https://p1-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/f2d7ce6ed4434b1084b4d5b0e7e03ddb~tplv-k3u1fbpfcp-zoom-crop-mark:1304:1304:1304:734.awebp?' alt='' /> */}
        </Paper>
        <div>
          <Button
            variant='outlined'
            style={{
              marginRight: 10,
            }}
            onClick={initializeImage}
          >
            恢复
          </Button>
          <Button
            style={{ width: 200 }}
            color='secondary'
            variant='contained'
            onClick={exportImage}
          >
            下载合成图
          </Button>
        </div>
      </Grid>
    </Grid>
  )
}
