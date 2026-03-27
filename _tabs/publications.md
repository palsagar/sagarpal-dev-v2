---
layout: page
icon: fas fa-file-alt
order: 1
title: Publications
---

<style>
  .pub-card {
    border: 1px solid var(--btn-border-color, #e0e0e0);
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 16px;
    background: var(--card-bg, transparent);
    transition: border-color 0.2s;
  }
  .pub-card:hover {
    border-color: var(--link-color, #2563eb);
  }
  .pub-meta {
    font-size: 0.85rem;
    color: var(--text-muted-color, #888);
    margin-bottom: 6px;
  }
  .pub-title {
    font-size: 1.1rem;
    font-weight: 600;
    margin-bottom: 6px;
    line-height: 1.4;
  }
  .pub-authors {
    font-size: 0.9rem;
    color: var(--text-muted-color, #888);
    margin-bottom: 10px;
  }
  .pub-desc {
    font-size: 0.92rem;
    line-height: 1.6;
    margin-bottom: 12px;
  }
  .pub-links {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .pub-links a {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 12px;
    border-radius: 4px;
    font-size: 0.82rem;
    font-weight: 500;
    text-decoration: none;
    transition: opacity 0.2s;
  }
  .pub-links a:hover {
    opacity: 0.8;
  }
  .pub-link-pdf {
    background: rgba(37, 99, 235, 0.12);
    color: var(--link-color, #2563eb);
  }
  .pub-link-doi {
    background: rgba(22, 163, 74, 0.12);
    color: #16a34a;
  }
</style>

{% for pub in site.data.publications %}
<div class="pub-card">
  <div class="pub-meta">{{ pub.journal }} &bull; {{ pub.year }}</div>
  <div class="pub-title">{{ pub.title }}</div>
  <div class="pub-authors">{{ pub.authors }}</div>
  <div class="pub-desc">{{ pub.description }}</div>
  <div class="pub-links">
    {% if pub.pdf %}
    <a href="{{ pub.pdf }}" class="pub-link-pdf" download>
      <i class="fas fa-file-pdf"></i> PDF
    </a>
    {% endif %}
    {% if pub.doi %}
    <a href="{{ pub.doi }}" class="pub-link-doi" target="_blank" rel="noopener">
      <i class="fas fa-external-link-alt"></i> DOI
    </a>
    {% endif %}
  </div>
</div>
{% endfor %}
