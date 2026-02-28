import './styles.css';

const app = document.querySelector('#app');

app.innerHTML = `
  <section class="shell">
    <h1>Muonium Physics Playground</h1>
    <p>Isolated runtime scaffold is ready.</p>
    <ul>
      <li>Separate HTML entrypoint</li>
      <li>Separate Vite build config</li>
      <li>Separate output directory</li>
    </ul>
  </section>
`;
