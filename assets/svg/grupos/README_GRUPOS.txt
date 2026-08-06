ESTRUCTURA PARA AGREGAR GRUPOS

Cada familia se registra UNA sola vez como grupo. No agregues las piezas por separado en js/svg-manager.js.

Ejemplo:
assets/svg/grupos/grupo-zena/
  meta.json
  zena-a.svg
  zena-b.svg
  zena-c.svg

manifest.json:
{
  "groups": [
    "grupo-zena/meta.json"
  ]
}

meta.json:
{
  "id": "grupo-zena",
  "name": "Zena",
  "type": "group",
  "pieces": [
    { "id": "pieza-a", "name": "Pieza A", "file": "zena-a.svg" },
    { "id": "pieza-b", "name": "Pieza B", "file": "zena-b.svg" },
    { "id": "pieza-c", "name": "Pieza C", "file": "zena-c.svg" }
  ],
  "layout": {
    "columns": 3,
    "rows": 1,
    "order": ["pieza-a", "pieza-b", "pieza-c"]
  }
}

El simulador permite visualizar el grupo durante la carga con 1 o 2 piezas, pero el grupo final debe contener de 3 a 6 piezas.
Todos los SVG deben conservar capas editables con IDs c1, c2, c3, etc.
