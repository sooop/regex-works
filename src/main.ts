import { mount } from 'svelte';
import './lib/motion/motion.css';
import './app.css';
import './layout.css';
import './lib/motion/motion.js'; // window.Motion (끌어 놓기 고스트·flash·pulse)
import App from './App.svelte';

export default mount(App, { target: document.getElementById('app')! });
