# survival_war

Este proyecto ha sido desarrollado utilizando la biblioteca **Three.js**, con el objetivo de crear una experiencia tridimensional inmersiva en un entorno de exploración y combate. El jugador se desplaza en primera persona dentro de un escenario 3D interactivo, donde puede disparar a enemigos, evitar colisiones y gestionar recursos como munición y vida. El enfoque principal es ofrecer una mecánica de juego simple pero envolvente, ideal para mostrar el potencial de Three.js combinado con modelos GLTF, efectos visuales y controles avanzados.

## Descripción General
El entorno implementa múltiples características visuales y funcionales que enriquecen la experiencia del usuario:

- Renderizado 3D utilizando **WebGL** y el motor de Three.js.
- **Modelo 3D de un arma** fijado a la cámara como HUD de combate.
- Sistema de **disparo** con balas GLB reutilizables que viajan en la dirección del jugador.
- **Enemigos animados** importados mediante `GLTFLoader` y clonados dinámicamente con `SkeletonUtils`.
- **Iluminación ambiental** y direccional, con sombras suaves para mayor realismo.
- Implementación de **colisiones físicas** mediante una cápsula de colisión y estructura Octree.
- Indicadores de **vida**, **puntos** y **munición**, visibles y actualizables durante la partida.
- **Sonidos ambientales** y efectos de disparo sincronizados con las acciones del jugador.
- **Controles de cámara en primera persona** con bloqueo de puntero y teclado.
- Sistema de niveles y condiciones de victoria o derrota integradas.

Este proyecto demuestra cómo Three.js puede ser utilizado para construir aplicaciones interactivas complejas que combinan gráficos 3D, lógica de juego y experiencia de usuario.



> Aplicación desarrollada por [Victor López](https://www.linkedin.com/in/victor-manuel-l%C3%B3pez-cruz-34bb39349/)
