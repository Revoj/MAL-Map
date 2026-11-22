import { mount } from 'svelte';
import App from './App.svelte';
import './styles.css';

mount(App, { target: document.getElementById('app')! });

if (import.meta.env.DEV) import('./lib/app.svelte.ts').then((m) => ((window as any).__app = m.app));
