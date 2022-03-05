import { useState } from 'react'
import './App.css'
import PsdImageGenerate from './PsdImageGenerate'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="App">
      <PsdImageGenerate psdUrl='https://file.ltwebstatic.com/cmpfile/product/4ECB9E4C08344B268439A37D5E801F2E.psd'></PsdImageGenerate>
    </div>
  )
}

export default App
