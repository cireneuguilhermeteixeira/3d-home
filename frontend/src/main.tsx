import React from 'react'
import { createRoot } from 'react-dom/client'
import HouseViewer3D from './components/HouseViewer3D'
import './style.css'

createRoot(document.getElementById('root')!).render(<React.StrictMode><HouseViewer3D /></React.StrictMode>)
