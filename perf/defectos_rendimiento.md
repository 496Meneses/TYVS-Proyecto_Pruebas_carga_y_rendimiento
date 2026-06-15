# Registro de Defectos — Pruebas de Carga y Rendimiento

Curso: Testing y Validación de Software\
Proyecto: Pruebas de Carga y Rendimiento – Registraduría Nacional\
Equipo: Estudiantes Maestría en Ingeniería de Software\
Fecha: 2026-06-14

---

## Introducción

Este documento recopila los defectos identificados durante la ejecución de pruebas de rendimiento
(Baseline, Load, Stress, Spike, Soak y Regresión).\
Cada defecto se documenta para garantizar trazabilidad, análisis técnico y propuesta de mejora.

---

# Formato 1: Lista detallada

## Defecto PERF-01 — Incumplimiento de SLO de latencia bajo carga normal (Load Test)

- **Capa afectada:** Aplicación / Base de datos
- **Escenario:** Load Test (200 VUs, rampa progresiva)
- **SLO definido:** p95 < 300 ms
- **Resultado esperado:** Cumplimiento del SLO bajo carga nominal.
- **Resultado obtenido:** p95 = 267 ms (cumple), pero p99 = 512 ms (cola larga preocupante)

### Evidencia

```
http_req_duration:
  avg=84.32ms  min=3.88ms  med=61.44ms  max=1243.87ms
  p(90)=198.31ms  p(95)=267.44ms  p(99)=512.88ms

http_req_failed: rate=0.0022  (0.22%)
```

### Impacto

El p99 de 512ms indica que el 1% de las transacciones (~1.867 de 186.752) experimenta
tiempos superiores a medio segundo bajo carga normal. En un sistema de registro civil esto
degrada la experiencia del ciudadano en momentos de alta demanda.

### Causa probable

- Pausas de GC (G1GC) de la JVM bajo alta concurrencia que añaden latencia esporádica.
- Contención en el pool de conexiones HikariCP (máx. 10 por defecto) cuando las 200 VUs
  compiten por acceso a la BD H2.

### Estado

Abierto

### Prioridad

Alta

---

## Defecto PERF-02 — Error rate elevado bajo Stress Test (>1%)

- **Capa afectada:** Servidor de aplicación / Base de datos
- **Escenario:** Stress Test (0 → 600 VUs)
- **SLO definido:** Error rate < 1%
- **Resultado obtenido:** 3.73%

### Evidencia

```
http_req_failed: rate=0.0373  (3.73%)

Distribución de errores:
  HTTP 500 Internal Server Error:  8.331  (2.85%)
  HTTP 503 Service Unavailable:    2.558  (0.87%)

Stack trace representativo:
  org.springframework.dao.DataAccessException: Unable to acquire JDBC Connection
  Caused by: java.sql.SQLTransientConnectionException:
    HikariPool-1 - Connection is not available, request timed out after 30000ms
```

### Impacto

A 600 VUs, el 3.73% de registros fallan sin re-intento automático. En una jornada electoral
esto equivale a decenas de miles de ciudadanos cuyo registro es rechazado silenciosamente.

### Causa probable

- Agotamiento del pool HikariCP (máx. 10 conexiones) con 600 hilos competidores.
- Servidor Tomcat con `threads.max=200` por defecto; peticiones excedentes son rechazadas.
- H2 en modo embebido serializa escrituras concurrentes con un único lock de WAL.

### Estado

En progreso

### Prioridad

Crítica

---

## Defecto PERF-03 — Degradación progresiva de latencia en Soak Test (2 horas)

- **Capa afectada:** JVM / Memoria / Base de datos H2
- **Escenario:** Soak Test (100 VUs, 2 horas)
- **Resultado esperado:** Latencia estable durante toda la prueba (p95 ≈ 200 ms constante)
- **Resultado obtenido:** Incremento progresivo de latencia media de 95 ms (minuto 10) a 340 ms (minuto 110)

### Evidencia

```
Evolución de avg latencia durante Soak Test:
  t=10min:   avg=95ms   p95=210ms
  t=30min:   avg=132ms  p95=287ms
  t=60min:   avg=198ms  p95=412ms
  t=90min:   avg=271ms  p95=581ms
  t=110min:  avg=340ms  p95=714ms  ← SLO p95 violado
```

Logs de JVM (extraídos de la aplicación durante la prueba):
```
[GC pause (G1 Evacuation Pause) 12.847ms]
[GC pause (G1 Evacuation Pause) 47.312ms]  ← pausa anómala a t=90min
[Full GC (Ergonomics) 312ms]               ← Full GC a t=107min, heap saturado
```

### Impacto

Posible fuga de memoria o acumulación de objetos no recolectados (RegistryRecord, conexiones
JDBC). Bajo operación continua (>2 horas) el sistema se degrada hasta violar SLOs sin que
se produzca ningún error explícito, dificultando la detección proactiva.

### Estado

Abierto

### Prioridad

Media

---

## Defecto PERF-04 — Crash del servidor bajo load test sin tuning JVM

- **Capa afectada:** JVM / Infraestructura
- **Escenario:** Load Test (200 VUs, sin think time, SLEEP_MS=0)
- **Resultado esperado:** El servidor maneja 200 VUs concurrentes durante 14 minutos.
- **Resultado obtenido:** La JVM terminó abruptamente a los ~85 segundos del inicio, con error "connection actively refused".

### Evidencia

```
k6 output:
  running (01m25s), 139/200 VUs, 2.537.873 complete (0% errors)
  [siguiente segunda] → connection actively refused (JVM crash)

Iteraciones totales al crash: ~2.537.873
Throughput antes del crash: ~29.800 req/s (ramp-up en progreso)
```

### Causa probable

- **Heap JVM por defecto insuficiente.** Spring Boot arrancó con la configuración default de la JVM, que limita el heap a ~256 MB (o 25 % de la RAM del sistema).
- Con 200 VUs y 0 ms de think time, el throughput alcanza ~35.000 req/s. En ~85 s se insertaron ~2,5 millones de registros en H2.
- H2 in-memory almacena todos los datos en el Java Heap. 2,5 M registros × ~100 bytes = ~250 MB, que sumado al overhead de la JVM y los 200 threads de Tomcat (~100 MB de stacks) supera el límite de heap disponible.
- La JVM lanzó `OutOfMemoryError` y terminó el proceso.

### Corrección aplicada

```bash
# Antes (falla):
java -jar target/clasesequivalencia-1.0-SNAPSHOT.jar

# Después (corregido):
java -Xms512m -Xmx4g -jar target/clasesequivalencia-1.0-SNAPSHOT.jar
```

### Estado

Resuelto (corrección temporal en entorno local)

### Prioridad

Alta

---

# Formato 2: Tabla de seguimiento

| ID       | Escenario         | Resultado Esperado        | Resultado Obtenido              | Estado            | Prioridad |
|----------|-------------------|---------------------------|---------------------------------|-------------------|-----------|
| PERF-01  | Load              | p95 < 300 ms              | p95=267ms, p99=512ms            | Abierto           | Alta      |
| PERF-02  | Stress            | Error rate < 1%           | 3.73%                           | En progreso       | Crítica   |
| PERF-03  | Soak (2h)         | Latencia estable          | Degradación 95ms → 340ms        | Abierto           | Media     |
| PERF-04  | Load (200 VUs)    | Sin crashes en 14 min     | JVM crash ~85s por OOM          | Resuelto (local)  | Alta      |

---

## Propuestas de Mejora

### PERF-01 y PERF-02: Pool de conexiones y hilos

```yaml
# application.properties
spring.datasource.hikari.maximum-pool-size=50
spring.datasource.hikari.minimum-idle=10
spring.datasource.hikari.connection-timeout=5000
server.tomcat.threads.max=400
server.tomcat.accept-count=200
```

### PERF-02: Reintentos con backoff

```java
@Retryable(value = DataAccessException.class, maxAttempts = 3,
           backoff = @Backoff(delay = 500, multiplier = 2))
public RegisterResult registerVoter(Person p) { ... }
```

### PERF-03: Tuning de JVM

```bash
java -Xms512m -Xmx1g -XX:+UseG1GC -XX:MaxGCPauseMillis=100 \
     -XX:+HeapDumpOnOutOfMemoryError -jar registraduria.jar
```

---

## Convenciones de Estado

**Abierto** → Defecto identificado sin corrección aplicada.\
**En progreso** → En proceso de corrección.\
**Resuelto** → Corregido y validado con nuevas pruebas.

---

Universidad de La Sabana — Facultad de Ingeniería\
Curso: Testing y Validación de Software (2025-1)
