const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const API = {
    list: 'https://l3lmirl4tr4yaa7mdrfxaa6hby0hnojf.lambda-url.us-east-2.on.aws/',
    create: 'https://k4fgww5ea733qqchdyeiwouyem0mfbnx.lambda-url.us-east-2.on.aws/',
    update: 'https://uhw4jmnzfygjt2zbvqosap4kri0xenbl.lambda-url.us-east-2.on.aws/',
    remove: 'https://oiawe2vmbwnie5fpjosmgzn3zu0ptrbl.lambda-url.us-east-2.on.aws/',
    images: 'https://azkjipmxdq5jc5iffeoipwbx5i0ggjvq.lambda-url.us-east-2.on.aws/',
    suscribir: 'https://yym2x6ybwfrhvjjwvqjx6udoum0vdbmw.lambda-url.us-east-2.on.aws/'
};

const ui = {
    tabs: $$('.tab'),
    sections: $$('.tab-content'),
    nav: $('#main-navigation'),
    menu: $('.menu-button'),
    fab: $('#main-fab'),
    noticeList: $('#news-list'),
    managedList: $('#managed-news-list'),
    form: $('#news-form'),
    image: $('#news-image'),
    mode: $('#form-mode'),
    save: $('#save-news'),
    cancel: $('#cancel-edit'),
    count: $('#editor-count'),
    status: $('#editor-status'),
    snackbar: $('#snackbar'),
    subscriptionDialog: $('#subscription-dialog'),
    subscriptionForm: $('#subscription-form'),
    subscriptionEmail: $('#subscriber-email'),
    subscriptionSubmit: $('#subscription-submit'),
    openSubscription: $('#open-subscription'),
    closeSubscription: $('#close-subscription')
};

let news = [];
let editing = null;
let messageTimer;

function message(text) {
    ui.snackbar.textContent = text;
    ui.snackbar.classList.add('is-visible');
    clearTimeout(messageTimer);
    messageTimer = setTimeout(() => ui.snackbar.classList.remove('is-visible'), 3200);
}

async function request(url, options = {}) {
    const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers };
    const response = await fetch(url, { ...options, headers });
    let data = await response.json().catch(() => ({}));
    if (typeof data.body === 'string') data = JSON.parse(data.body);
    if (!response.ok || data.error) {
        const detail = data.detalle ? `: ${data.detalle}` : '';
        throw new Error(`${data.error || `Error de API: ${response.status}`}${detail}`);
    }
    return data;
}

function dateLabel(value) {
    if (!value) return 'fecha no disponible';
    const date = new Date(String(value).includes('T') ? value : `${value}T00:00:00`);
    return Number.isNaN(date.getTime())
        ? 'fecha no disponible'
        : new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short' })
            .format(date).replace('.', '');
}

async function signedImage(url) {
    if (!url) return null;
    try {
        const key = new URL(url).pathname.replace(/^\/+/, '');
        const data = await request(`${API.images}?${new URLSearchParams({ action: 'read', key })}`);
        return data.imageUrl;
    } catch (error) {
        console.error('No se pudo cargar la imagen:', error);
        return null;
    }
}

async function uploadImage(file) {
    const query = new URLSearchParams({ file: file.name });
    const signed = await request(`${API.images}?${query}`);
    const upload = await fetch(signed.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': signed.contentType || file.type },
        body: file
    });
    if (!upload.ok) throw new Error('No se pudo subir la imagen a S3.');
    return signed.imagenUrl;
}

async function newsCard(item, featured) {
    const card = document.createElement('article');
    card.className = `story-card story-card--compact${featured ? ' story-card--feature' : ''}`;
    const imageUrl = await signedImage(item.imagenUrl || item.imageUrl);
    if (imageUrl) {
        const image = Object.assign(document.createElement('img'), {
            src: imageUrl,
            alt: `Imagen de ${item.titulo || 'la noticia'}`
        });
        image.loading = featured ? 'eager' : 'lazy';
        card.append(image);
    }
    const body = document.createElement('div');
    body.className = 'story-card-body';
    body.innerHTML = `
        <p class="card-kicker">Noticias UNSIS · ${dateLabel(item.fecha || item.creadoEn)}</p>
        <h3></h3><p></p>`;
    body.querySelector('h3').textContent = item.titulo || 'Noticia sin título';
    body.querySelector('p:last-child').textContent =
        item.detalles || 'Consulta los detalles de esta noticia próximamente.';
    card.append(body);
    return card;
}

async function renderNews() {
    ui.noticeList.replaceChildren();
    if (!news.length) {
        ui.noticeList.append(status('Aún no hay noticias disponibles.'));
        return;
    }
    const cards = await Promise.all(news.map((item, index) => newsCard(item, index === 0)));
    cards.forEach((card, index) => {
        if (index === cards.length - 1) card.classList.add('story-card--accent');
        ui.noticeList.append(card);
    });
}

function status(text) {
    const element = document.createElement('p');
    element.className = 'news-status';
    element.textContent = text;
    return element;
}

function renderManaged(error = '') {
    if (!ui.managedList) return;
    ui.managedList.replaceChildren();
    if (error) {
        ui.managedList.append(status(`No se pudo cargar el contenido: ${error}`));
        return;
    }
    ui.count.textContent = `${news.length} ${news.length === 1 ? 'noticia' : 'noticias'}`;
    if (!news.length) {
        ui.managedList.append(status('Todavía no hay noticias publicadas.'));
        return;
    }
    news.forEach((item) => {
        const row = document.createElement('article');
        row.className = 'managed-news-item';
        row.innerHTML = '<div><h4></h4><time></time></div><div class="managed-news-actions"></div>';
        row.querySelector('h4').textContent = item.titulo || 'Noticia sin título';
        row.querySelector('time').textContent = dateLabel(item.fecha || item.creadoEn);
        row.querySelector('.managed-news-actions').append(
            action('Editar', () => startEdit(item)),
            action('Eliminar', () => deleteNews(item), 'btn-text--danger')
        );
        ui.managedList.append(row);
    });
}

function action(text, handler, extraClass = '') {
    const button = document.createElement('button');
    button.className = `btn-text ${extraClass}`;
    button.type = 'button';
    button.textContent = text;
    button.addEventListener('click', handler);
    return button;
}

async function loadNews() {
    try {
        const data = await request(API.list);
        news = (Array.isArray(data) ? data : data.Items || [])
            .sort((a, b) => new Date(b.fecha || b.creadoEn) - new Date(a.fecha || a.creadoEn));
        await renderNews();
        renderManaged();
    } catch (error) {
        console.error(error);
        ui.noticeList.replaceChildren(status('No fue posible cargar las noticias. Inténtalo más tarde.'));
        renderManaged(error.message);
        message('Error al cargar las noticias.');
    }
}

function selectTab(id) {
    ui.tabs.forEach((tab) => {
        const active = tab.dataset.target === id;
        tab.classList.toggle('is-active', active);
        tab.setAttribute('aria-selected', active);
    });
    ui.sections.forEach((section) => { section.hidden = section.id !== id; });
    ui.fab.hidden = id !== 'tab-comunidad';
    ui.nav.classList.remove('is-open');
    ui.menu.setAttribute('aria-expanded', 'false');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function startEdit(item) {
    editing = item;
    ui.form.elements.titulo.value = item.titulo || '';
    ui.form.elements.detalles.value = item.detalles || '';
    ui.form.elements.fecha.value = (item.fecha || '').slice(0, 10);
    ui.mode.textContent = 'Editando noticia';
    ui.save.textContent = 'Guardar cambios';
    ui.cancel.hidden = false;
    ui.form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetForm() {
    editing = null;
    ui.form.reset();
    ui.mode.textContent = 'Nueva noticia';
    ui.save.textContent = 'Agregar noticia';
    ui.cancel.hidden = true;
}

async function subscribeToNewsletter(email) {
    ui.subscriptionSubmit.disabled = true;
    try {
        const data = await request(API.suscribir, {
            method: 'POST',
            body: JSON.stringify({ email })
        });
        message(data.mensaje || 'Suscripción iniciada. Revisa tu correo para confirmarla.');
        ui.subscriptionForm.reset();
        ui.subscriptionDialog.close();
    } catch (error) {
        console.error('No se pudo iniciar la suscripción:', error);
        message(error.message || 'No se pudo procesar la suscripción.');
    } finally {
        ui.subscriptionSubmit.disabled = false;
    }
}

ui.tabs.forEach((tab) => tab.addEventListener('click', () => selectTab(tab.dataset.target)));
$$('[data-target]:not(.tab)').forEach((link) => link.addEventListener('click', () => selectTab(link.dataset.target)));
$$('[data-message]').forEach((button) => button.addEventListener('click', () => message(button.dataset.message)));
ui.menu.addEventListener('click', () => {
    const open = ui.nav.classList.toggle('is-open');
    ui.menu.setAttribute('aria-expanded', open);
});
ui.fab.addEventListener('click', () => message('El editor de publicaciones estará disponible próximamente.'));
ui.cancel.addEventListener('click', resetForm);
$('#refresh-news').addEventListener('click', loadNews);
ui.openSubscription.addEventListener('click', () => {
    ui.subscriptionDialog.showModal();
    ui.subscriptionEmail.focus();
});
ui.closeSubscription.addEventListener('click', () => ui.subscriptionDialog.close());
ui.subscriptionForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = ui.subscriptionEmail.value.trim();
    if (!email) return;
    await subscribeToNewsletter(email);
});

ui.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(ui.form));
    delete data.imagen;
    const file = ui.image.files?.[0];
    const payload = editing ? { ...data, idNoticia: editing.idNoticia } : data;
    ui.save.disabled = true;
    ui.status.textContent = 'Guardando...';
    try {
        if (file) payload.imagenUrl = await uploadImage(file);
        const result = await request(editing ? API.update : API.create, {
            method: 'POST', body: JSON.stringify(payload)
        });
        if (file && !editing && !result.item?.imagenUrl) {
            throw new Error('La Lambda no guardó la URL de la imagen.');
        }
        message(editing ? 'Noticia actualizada correctamente.' : 'Noticia agregada correctamente.');
        resetForm();
        await loadNews();
    } catch (error) {
        console.error(error);
        message(error.message);
    } finally {
        ui.save.disabled = false;
        ui.status.textContent = '';
    }
});

async function deleteNews(item) {
    if (!confirm(`¿Eliminar “${item.titulo || 'esta noticia'}”? Esta acción no se puede deshacer.`)) return;
    ui.status.textContent = 'Eliminando...';
    try {
        await request(API.remove, { method: 'POST', body: JSON.stringify({ idNoticia: item.idNoticia }) });
        message('Noticia eliminada correctamente.');
        await loadNews();
    } catch (error) {
        console.error(error);
        message(error.message);
    } finally {
        ui.status.textContent = '';
    }
}

loadNews();
