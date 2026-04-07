---
layout: page
icon: fas fa-code
order: 2
title: Projects
---

<style>
  .proj-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 20px;
  }
  .proj-card {
    border: 1px solid var(--btn-border-color, #e0e0e0);
    border-radius: 8px;
    padding: 20px;
    background: var(--card-bg, transparent);
    transition: border-color 0.2s;
  }
  .proj-card:hover {
    border-color: var(--link-color, #2563eb);
  }
  .proj-title {
    font-size: 1.15rem;
    font-weight: 600;
    margin-bottom: 4px;
  }
  .proj-tagline {
    font-size: 0.9rem;
    color: var(--text-muted-color, #888);
    margin-bottom: 12px;
  }
  .proj-desc {
    font-size: 0.92rem;
    line-height: 1.6;
    margin-bottom: 14px;
  }
  .proj-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 14px;
  }
  .proj-tag {
    background: rgba(37, 99, 235, 0.1);
    color: var(--link-color, #2563eb);
    padding: 3px 10px;
    border-radius: 12px;
    font-size: 0.78rem;
    font-weight: 500;
  }
  .proj-links {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  .proj-links a {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 500;
    text-decoration: none;
    transition: opacity 0.2s;
  }
  .proj-links a:hover {
    opacity: 0.8;
  }
  .proj-link-demo {
    background: var(--link-color, #2563eb);
    color: #fff;
  }
  .proj-link-github {
    border: 1px solid var(--btn-border-color, #e0e0e0);
    color: var(--text-color, inherit);
  }
</style>

<div class="proj-grid">
{% for proj in site.data.projects %}
  <div class="proj-card">
    <div class="proj-title">{{ proj.title }}</div>
    <div class="proj-tagline">{{ proj.tagline }}</div>
    <div class="proj-desc">{{ proj.description }}</div>
    <div class="proj-tags">
      {% for tag in proj.tags %}
      <span class="proj-tag">{{ tag }}</span>
      {% endfor %}
    </div>
    <div class="proj-links">
      {% if proj.demo %}
      <a href="{{ proj.demo }}" class="proj-link-demo" target="_blank" rel="noopener">
        <i class="fas fa-external-link-alt"></i> Live Demo
      </a>
      {% endif %}
      {% if proj.pypi %}
      <a href="{{ proj.pypi }}" class="proj-link-demo" target="_blank" rel="noopener">
        <i class="fas fa-cube"></i> PyPI
      </a>
      {% endif %}
      {% if proj.github %}
      <a href="{{ proj.github }}" class="proj-link-github" target="_blank" rel="noopener">
        <i class="fab fa-github"></i> Source
      </a>
      {% endif %}
    </div>
  </div>
{% endfor %}
</div>
