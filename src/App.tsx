import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { EditorPage } from '@/pages/EditorPage'
import { PlayerPage } from '@/pages/PlayerPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<EditorPage />} />
        <Route path="/play" element={<PlayerPage />} />
      </Routes>
    </BrowserRouter>
  )
}
