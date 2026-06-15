# Proyecto Final – Pruebas de Carga y Rendimiento

Este proyecto final tiene como propósito diseñar, ejecutar y analizar pruebas de rendimiento sobre un servicio REST desarrollado durante el curso.  
El equipo deberá aplicar técnicas de pruebas de carga utilizando k6, definir objetivos de nivel de servicio (SLO), interpretar métricas de rendimiento y documentar defectos relacionados con desempeño.

El enfoque no es únicamente ejecutar pruebas, sino analizar técnicamente el comportamiento del sistema bajo distintas condiciones de carga y proponer mejoras fundamentadas.

---

## 2. Objetivos Académicos

- Diseñar escenarios de pruebas de rendimiento progresivos y justificarlos técnicamente.
- Ejecutar pruebas de carga, estrés, pico, resistencia y regresión.
- Definir SLO medibles y evaluar su cumplimiento.
- Analizar métricas como latencia promedio, p95, p99, throughput y tasa de errores.
- Identificar cuellos de botella.
- Documentar defectos de rendimiento.
- Integrar pruebas de rendimiento dentro de un flujo reproducible (opcional CI/CD).

---

## 3. Alcance Técnico

El equipo podrá elegir uno de los siguientes enfoques:

1. Realizar pruebas sobre un endpoint real de un aplicativo en ambiente controlado.
2. Implementar el endpoint `/voter/register`.
3. Aplicar pruebas sobre un microservicio desarrollado previamente en el curso.

El sistema debe ejecutarse localmente o mediante contenedor Docker.

---

## 4. Tipos de Pruebas Obligatorias

El proyecto debe incluir como mínimo:

- Baseline Test
- Load Test
- Stress Test
- Spike Test
- Soak Test
- Regresión de rendimiento

Cada escenario debe estar correctamente configurado y documentado.

---

## 5. Estructura Sugerida del Repositorio

```
perf-project/
 ├─ src/
 ├─ perf/
 │   ├─ scripts/
 │   │   ├─ register_person_k6.js
 │   │   └─ voter_k6.js
 │   ├─ data/
 │   ├─ results/
 │   ├─ defectos_rendimiento.md
 │   └─ ci/
 │       └─ github-actions.yml
 ├─ README.md
 └─ integrantes.txt
```

---

## 6. Ejecución Reproducible

El proyecto debe ejecutarse completamente desde consola.

Ejecución del servicio (ejemplo, esto puede cambiar dependiendo del proyecto):

```
mvn clean spring-boot:run
```

Ejecución de pruebas:

```
k6 run perf/scripts/register_person_k6.js --env SCENARIO=load
```

Los resultados deben almacenarse automáticamente en `/perf/results`.

---

## 7. Definición de SLO

El equipo debe definir al menos dos SLO claros y medibles.

Ejemplos:

- p95 < 300 ms
- Error rate < 1 %
- Disponibilidad ≥ 99 %

Los SLO deben justificarse técnicamente en función del tipo de sistema evaluado.

---

## 8. Métricas Obligatorias

En cada escenario se debe reportar:

- Latencia promedio
- p95
- p99
- Throughput (req/s)
- Tasa de errores

Debe incluirse análisis comparativo entre escenarios.

---

## 9. Registro de Defectos de Rendimiento

Se debe crear el archivo `perf/defectos_rendimiento.md` basado en el template institucional.

Cada defecto debe incluir:

- Identificador
- Escenario donde ocurre
- Evidencia (métrica o log)
- Impacto
- Propuesta de mejora

Se requieren mínimo tres defectos documentados.

---

## 10. Wiki del Proyecto (Documento Oficial)

La evaluación se realizará principalmente sobre la Wiki del repositorio.

Estructura sugerida:

1. Introducción y arquitectura del sistema.
2. Definición de SLO.
3. Configuración de escenarios.
4. Resultados detallados.
5. Comparación entre escenarios.
6. Identificación de cuellos de botella.
7. Registro de defectos.
8. Propuestas de mejora.
9. Reflexión técnica.

---

## 11. Diferenciación con Otros Proyectos del Curso

| Proyecto | Enfoque |
|----------|---------|
| Unitarias | Validación de lógica interna |
| Integración | Validación de colaboración entre capas |
| Rendimiento | Validación del comportamiento bajo carga y condiciones extremas |

Este proyecto introduce la dimensión temporal y de resiliencia del sistema.

---

## 12. Rúbrica de Evaluación (50 puntos)

## Rúbrica de evaluación

| **Criterios de evaluación** | **Indicadores de cumplimiento** | **Excelente (5 pts)** | **Bueno (4 pts)** | **Necesita mejorar (3.5 pts)** | **Deficiente (2.5 pts)** | **No cumple (0 pts)** |
|------------------------------|---------------------------------|------------------------|--------------------|---------------------------------|---------------------------|------------------------|
| **Diseño de escenarios de rendimiento** | Baseline, Load, Stress, Spike, Soak y Regresión correctamente configurados. | Escenarios progresivos, técnicamente justificados y reproducibles. | Escenarios completos con leves inconsistencias. | Faltan uno o dos escenarios o sin justificación técnica. | Configuración incorrecta o sin progresión lógica. | No implementa escenarios requeridos. |
| **Implementación técnica de scripts k6** | Uso correcto de VUs, stages, thresholds y dataset. | Scripts parametrizados, organizados y totalmente funcionales. | Scripts funcionales con leves errores de estructura. | Funcionan parcialmente o con hardcode excesivo. | Presentan errores de ejecución. | No entrega scripts funcionales. |
| **Definición y validación de SLO** | Objetivos claros y medibles (latencia, error rate, etc.). | SLO bien definidos, medidos y analizados en todos los escenarios. | SLO definidos pero análisis parcial. | SLO poco claros o sin validación consistente. | SLO mal definidos o sin evidencia. | No define SLO. |
| **Análisis de métricas de rendimiento** | Interpretación de p95, p99, throughput y error rate. | Análisis comparativo profundo entre escenarios y versiones. | Análisis correcto pero superficial. | Reporta métricas sin interpretación sólida. | Solo copia resultados sin análisis. | No presenta análisis. |
| **Gestión de defectos de rendimiento** | Registro estructurado y seguimiento. | Documento completo con evidencia, impacto y propuesta de mejora. | Registro con evidencia parcial. | Lista defectos sin análisis profundo. | Registro mínimo o incompleto. | No presenta defectos. |
| **Observabilidad y diagnóstico técnico** | Identificación de cuellos de botella y causas probables. | Correlaciona métricas de aplicación con infraestructura (CPU, memoria, threads). | Identifica causas probables sin evidencia técnica suficiente. | Menciona problemas sin diagnóstico claro. | Análisis superficial. | No identifica causas. |
| **Reproducibilidad del proyecto** | Ejecución desde consola sin intervención manual. | Proyecto ejecuta correctamente con documentación clara. | Requiere pequeños ajustes manuales. | Ejecución parcial o poco clara. | Difícil de ejecutar. | No ejecuta. |
| **Documentación en Wiki** | Claridad, estructura y evidencias técnicas. | Wiki completa, organizada y con análisis detallado. | Bien estructurada con faltantes menores. | Parcial o poco clara. | Incompleta o sin evidencias técnicas. | No hay Wiki. |
| **Reflexión técnica y conclusiones** | Aprendizajes y mejoras propuestas. | Reflexión crítica con propuestas técnicas fundamentadas. | Reflexión adecuada pero general. | Reflexión superficial. | Reflexión mínima. | No presenta reflexión. |
| **Calidad general del proyecto** | Coherencia técnica y presentación. | Integración sólida entre pruebas, análisis y documentación. | Buen nivel general con leves inconsistencias. | Parcialmente funcional. | Fallos técnicos importantes. | Proyecto incompleto o no funcional. |

| **Rango de puntaje** | **Desempeño** |
|----------------------|----------------|
| 45 – 50 | Excelente manejo de pruebas de rendimiento y análisis técnico avanzado. |
| 35 – 44 | Buen trabajo, ejecución completa con fallas menores en análisis o documentación. |
| 30 – 34 | Cumple con lo básico, faltan evidencias o profundidad técnica. |
| < 30 | No cumple con los criterios mínimos del proyecto. |

---

## 13. Referencias

- Grafana k6 Documentation  
- Google SRE Book – Service Level Objectives  
- ISO/IEC 25010 – Performance Efficiency  

---

## Créditos y uso académico

**Autor:** César Augusto Vega Fernández
**Curso:** Testing y Validación de Software
**Programa:** Maestría en Ingeniería de Software – Universidad de La Sabana
**Año:** 2025

Este taller y su contenido fueron diseñados por el profesor **César Augusto Vega Fernández** como material académico para el curso *Testing y Validación de Software*, impartido en la **Maestría en Ingeniería de Software de la Universidad de La Sabana**.

Material de uso **exclusivamente académico**, orientado a fortalecer las competencias en **pruebas de carga y rendimiento, con un componente de control de defectos** dentro del ciclo DevSecOps.

---

### Licencia de uso

Este material se distribuye bajo la licencia [Creative Commons Atribución-NoComercial-CompartirIgual 4.0 Internacional (CC BY-NC-SA 4.0)](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.es).

Puedes **usar, adaptar o compartir** este contenido con fines educativos, siempre que:

1. Se reconozca la autoría del profesor **César Augusto Vega Fernández**.
2. No se utilice con fines comerciales.
3. Las obras derivadas se distribuyan bajo la misma licencia.

---

© Universidad de La Sabana – Facultad de Ingeniería
Maestría en Ingeniería de Software – 2025
