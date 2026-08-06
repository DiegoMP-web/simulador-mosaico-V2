TODO DE MOSAICO — Simulador mejorado (agosto 2026)

Base consolidada para retomar el proyecto.

Cambios principales:
- Tapetes funciona como categoría independiente.
- Retícula fija 6 x 6.
- Editor de color exclusivo a la izquierda.
- Diseños usados debajo del editor, máximo 6.
- Clic izquierdo: colocar o reemplazar diseño activo.
- Clic derecho: rotar la celda 90 grados.
- Botón Vaciar celda: elimina únicamente la celda seleccionada.
- La rotación no se hereda al replicar una pieza.
- Colores independientes por diseño/celda.
- Diseño de tapetes estable sin comprimir la retícula.
- Al cambiar categoría o subcategoría se selecciona un modelo válido automáticamente.
- Cuadrados, Hexagonales, Tapetes y Grupos mantienen filtros separados.
- Reiniciar limpia retícula, brocha y combinaciones de color.

Estructura recomendada para cenefas:
assets/cenefas/<familia>/corner.svg
assets/cenefas/<familia>/edge.svg

Abrir index.html mediante Live Server o un servidor HTTP local.

NUEVO MÓDULO GRUPOS — 2026-08
--------------------------------
- Grupos funciona como módulo independiente de Tapetes.
- Admite familias de 3 a 6 piezas.
- Cada pieza conserva una paleta de colores independiente.
- Las piezas A–F se seleccionan debajo del editor grande.
- A la derecha se actualiza la composición completa del grupo.
- Descargar diseño genera:
  * grupo completo en SVG;
  * grupo completo en PNG;
  * cada pieza individual en SVG con sus colores.
- Los grupos se registran en assets/svg/grupos/manifest.json.
- Se incluye grupo-ejemplo para comprobar el funcionamiento.
- Consulta assets/svg/grupos/README_GRUPOS.txt para agregar nuevas familias.
