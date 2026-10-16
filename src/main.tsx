import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { applyCourseToDocument } from './lib/course';

applyCourseToDocument();

createRoot(document.getElementById('root')!).render(<App />);
