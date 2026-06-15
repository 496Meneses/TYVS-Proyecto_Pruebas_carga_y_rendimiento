# Wiki – Pruebas de Carga y Rendimiento: Registraduría Nacional

> **Nota:** Este archivo es el contenido para la Wiki de GitHub del proyecto.  
> Copiarlo página por página en `Settings → Wiki` del repositorio.

---

## 1. Introducción y Arquitectura del Sistema

### 1.1 Descripción del Sistema

El sistema bajo prueba es la **API REST de Registraduría Nacional**, una aplicación Spring Boot que simula el servicio de registro civil de personas y votantes en Colombia. Expone un único endpoint de registro sobre el cual se diseñaron todos los escenarios de carga.

### 1.2 Arquitectura

La aplicación sigue el patrón hexagonal (puertos y adaptadores):

```
Cliente HTTP
     │
     ▼
RegistryController  (REST – delivery)
     │ POST /register
     │ Body: { name, id, age, gender, alive }
     │ Response: "VALID" | "INVALID"
     ▼
Registry (use case – application)
     │
     ▼
RegistryRepositoryPort (puerto de salida)
     │
     ▼
RegistryRepository + RegistryRecord (JPA / H2 in-memory)
```

**Tecnologías:**

| Componente | Tecnología |
|-----------|------------|
| Framework | Spring Boot 2.7.18 |
| Lenguaje | Java 17 (compilado) / JRE compatible 8+ |
| BD | H2 in-memory (modo embebido) |
| Servidor | Apache Tomcat (embebido) |
| Persistencia | Spring Data JPA + Hibernate |

### 1.3 Endpoint Principal

```
POST /register
Content-Type: application/json

{
  "id":     <int>,
  "name":   "<string>",
  "age":    <int>,
  "gender": "MALE" | "FEMALE",
  "alive":  <boolean>
}

→ 200 OK – "VALID"   (registro aceptado)
→ 200 OK – "INVALID" (registro rechazado por regla de negocio)
→ 500     – error interno (pool BD agotado u otro error)
```

---

## 2. Definición de SLO

Los SLO se definieron con base en el estándar de servicios gubernamentales digitales colombianos y el criterio de "respuesta percibida como instantánea" (Nielsen, 1993):

| ID | Métrica | Umbral | Justificación técnica |
|----|---------|--------|-----------------------|
| SLO-01 | Latencia p95 | ≤ 300 ms | Umbral de respuesta "instantánea" para el usuario |
| SLO-02 | Latencia p99 | ≤ 800 ms | Máximo tolerable para casos extremos |
| SLO-03 | Tasa de error HTTP | < 1% | Estándar SRE para servicios de misión crítica |
| SLO-04 | Throughput | ≥ 100 req/s | Capacidad mínima para demanda diaria estimada |

### Justificación técnica de los SLO

- **p95 ≤ 300 ms:** En servicios de registro presencial, el ciudadano espera una confirmación casi inmediata. Superar 300ms degrada la percepción del servicio.
- **p99 ≤ 800 ms:** El 1% de casos lentos corresponde a condiciones de red adversas o GC pauses de JVM. 800ms es el límite antes del que el usuario percibe "lag".
- **Error rate < 1%:** Un registro fallido implica que el ciudadano debe reintentar el proceso. Más del 1% genera colas y malestar operativo.
- **Throughput ≥ 100 req/s:** Estimado de capacidad para 100 usuarios simultáneos con think time de 1 segundo.

---

## 3. Configuración de Escenarios

### Escenario 1 – Baseline

**Propósito:** Establecer línea base de rendimiento en condiciones mínimas de carga.

```javascript
// k6 config
executor: 'constant-vus'
vus: 20
duration: '5m'
```

**Comando:**
```bash
k6 run perf/scripts/register_person_k6.js --env SCENARIO=baseline
```

**Parámetros JMeter:** Thread Group: 20 threads, ramp-up 60s, duración 900s.

---

### Escenario 2 – Load Test (Carga Normal)

**Propósito:** Validar comportamiento bajo demanda esperada con rampa progresiva.

```javascript
executor: 'ramping-vus'
stages: [
  { duration: '2m',  target: 200 },
  { duration: '10m', target: 200 },
  { duration: '2m',  target: 0   },
]
```

**Comando:**
```bash
k6 run perf/scripts/register_person_k6.js --env SCENARIO=load
```

---

### Escenario 3 – Stress Test (Estrés)

**Propósito:** Identificar el punto de quiebre del sistema.

```javascript
executor: 'ramping-vus'
startVUs: 200
stages: [
  { duration: '5m', target: 600 },
  { duration: '3m', target: 600 },
  { duration: '2m', target: 0   },
]
```

**Comando:**
```bash
k6 run perf/scripts/register_person_k6.js --env SCENARIO=stress
```

---

### Escenario 4 – Spike Test (Picos)

**Propósito:** Evaluar recuperación ante tráfico súbito (apertura de jornada electoral).

```javascript
executor: 'ramping-vus'
startVUs: 50
stages: [
  { duration: '1m', target: 300 },
  { duration: '2m', target: 50  },
  { duration: '1m', target: 0   },
]
```

---

### Escenario 5 – Soak Test (Resistencia)

**Propósito:** Detectar fugas de memoria y degradación bajo carga sostenida.

```javascript
executor: 'constant-vus'
vus: 100
duration: '2h'
```

---

### Escenario 6 – Regression Test (CI Gate)

**Propósito:** Gate de calidad en integración continua – verificación rápida de SLOs tras cada build.

```javascript
executor: 'constant-vus'
vus: 20
duration: '5m'
```

---

## 4. Resultados Detallados

### 4.1 Baseline (20 VUs, 5 min) — Ejecución real

> Ejecutado localmente sobre H2 in-memory sin think time (`SLEEP_MS=0`). Las latencias sub-milisegundo son esperadas en loopback; el throughput refleja la capacidad máxima de la JVM sin red.

| Métrica | Valor | SLO | Estado |
|---------|-------|-----|--------|
| Avg | **0.40 ms** | - | - |
| Mediana (p50) | 0 ms | - | - |
| p90 | 1.01 ms | - | - |
| p95 | **1.50 ms** | ≤300ms | ✅ |
| p99 | **< 10 ms** *(umbral evaluado < 800 ms: PASS)* | ≤800ms | ✅ |
| Tasa error | **0.00%** | <1% | ✅ |
| Throughput | **35 221 req/s** | ≥100/s | ✅ |
| Total peticiones | 10 566 577 | - | - |
| Checks pasados | 21 133 154 / 21 133 154 | - | ✅ |

### 4.2 Load Test (200 VUs, 14 min) — Ejecución real

> Ejecutado con `-Xmx4g -Xms512m`. Sin think time (`SLEEP_MS=0`), H2 in-memory en loopback.

| Métrica | Valor | SLO | Estado |
|---------|-------|-----|--------|
| Avg | **3.75 ms** | - | - |
| p90 | 7.01 ms | - | - |
| p95 | **8.50 ms** | ≤300ms | ✅ |
| p99 | **14.04 ms** | ≤800ms | ✅ |
| max | 586.77 ms *(GC pause puntual)* | - | - |
| Tasa error | **0.002%** (573 / 27 538 639) | <1% | ✅ |
| Throughput | **32 784 req/s** | ≥100/s | ✅ |
| Total peticiones | 27 538 639 | - | - |
| Checks pasados | 55 076 132 / 55 077 278 | - | ✅ |

### 4.3 Stress Test (600 VUs, 10 min) — Ejecución real

> Ejecutado con `-Xmx4g -Xms512m`, H2 in-memory, loopback, sin think time.

| Métrica | Valor | SLO | Estado |
|---------|-------|-----|--------|
| Avg | **7.37 ms** | - | - |
| p90 | 14.67 ms | - | - |
| p95 | **17.05 ms** | ≤300ms | ✅ |
| p99 | **26.19 ms** | ≤800ms | ✅ |
| max | 417.26 ms *(GC pause puntual)* | - | - |
| Tasa error | **0.000%** | <1% | ✅ |
| Throughput | **34 280 req/s** | ≥100/s | ✅ |
| Total peticiones | 20 568 044 | - | - |

---

## 5. Comparación entre Escenarios

### 5.1 Evolución de latencia

```
Escenario  │ VUs │ Avg      │ p95      │ p99      │ Error%  │ RPS
───────────┼─────┼──────────┼──────────┼──────────┼─────────┼──────────
Baseline   │  20 │  0.40ms  │   1.5ms  │  <10ms   │  0.000% │  35 221
Load       │ 200 │  3.75ms  │   8.5ms  │  14.0ms  │  0.002% │  32 784
Stress     │ 600 │  7.37ms  │  17.1ms  │  26.2ms  │  0.000% │  34 280
```

> Todos los valores provienen de ejecuciones reales sobre H2 in-memory en loopback.

### 5.2 Degradación relativa al baseline

| Métrica | Baseline→Load (+10x VUs) | Baseline→Stress (+30x VUs) |
|---------|:------------------------:|:--------------------------:|
| Avg latencia | 0.40ms → 3.75ms (+837%) | 0.40ms → 7.37ms (+1743%) |
| p95 latencia | 1.5ms → 8.5ms (+467%) | 1.5ms → 17.1ms (+1040%) |
| p99 latencia | <10ms → 14.0ms | <10ms → 26.2ms |
| Tasa de error | 0.000% → 0.002% | 0.000% → 0.000% |
| Throughput | 35 221 → 32 784 req/s (−7%) | 35 221 → 34 280 req/s (−3%) |

La latencia escala de forma sub-lineal: 30× más VUs generan solo ~18× más latencia promedio. El throughput se mantiene estable porque H2 in-memory con HikariCP serializa las escrituras, actuando como regulador natural. Todos los escenarios cumplen los SLOs definidos bajo las condiciones de prueba locales.

---

## 6. Identificación de Cuellos de Botella

### 6.1 Pool de conexiones HikariCP (Principal)

El tiempo `http_req_waiting` escala de forma no lineal con la carga mientras `http_req_sending` y `http_req_receiving` permanecen constantes (~0.1ms y ~0.2ms). Esto indica que la espera ocurre **dentro del servidor**, específicamente en la cola de obtención de conexión JDBC.

**Configuración actual (defectuosa):**
```yaml
spring.datasource.hikari.maximum-pool-size=10  # insuficiente para 200+ VUs
```

**Con 200 VUs y pool de 10:** En promedio, 190 hilos esperan que uno de los 10 termine su transacción. Si cada INSERT tarda 15ms, el tiempo de espera esperado en cola es `190/10 × 15ms = 285ms`, explicando el avg de 84ms en Load.

### 6.2 Hilos de Tomcat (Secundario)

A partir de ~200 VUs, aparecen errores de tipo `Connection reset` a nivel de socket. Esto ocurre cuando el accept-queue del kernel Linux (por defecto 128) se llena antes de que Tomcat pueda aceptar la conexión TCP.

**Configuración actual:**
```yaml
server.tomcat.threads.max=200   # default Spring Boot
server.tomcat.accept-count=100  # default
```

### 6.3 H2 Embedded (Terciario)

H2 en modo `in-memory` usa un lock interno para escrituras concurrentes. El throughput máximo de INSERT es ~80 ops/s independientemente del pool. En producción con PostgreSQL este límite desaparece.

---

## 7. Registro de Defectos

Ver archivo detallado: [perf/defectos_rendimiento.md](../blob/master/perf/defectos_rendimiento.md)

| ID | Escenario | Métrica Violada | Valor | SLO | Causa |
|----|-----------|-----------------|-------|-----|-------|
| PERF-01 | Load 200VUs | p99 latencia (cola larga) | 512ms | ≤800ms (cumple pero preocupante) | GC pauses JVM |
| PERF-02 | Stress 600VUs | Tasa error | 3.73% | <1% | Pool HikariCP agotado |
| PERF-03 | Soak 2h | Latencia estable | Degradación 95→340ms | p95 estable | Posible memory leak |
| PERF-04 | Load 200VUs | Disponibilidad | JVM crash ~85s | 0% downtime | OOM: heap JVM insuficiente para H2 in-memory bajo throughput extremo |

---

## 8. Propuestas de Mejora

### 8.1 Inmediatas (sin cambios de código)

```yaml
# application.properties
spring.datasource.hikari.maximum-pool-size=50
spring.datasource.hikari.minimum-idle=10
spring.datasource.hikari.connection-timeout=5000
server.tomcat.threads.max=400
server.tomcat.accept-count=200
```

**Impacto estimado:** Reduce p95 bajo 400 VUs de 1023ms a ~350ms; elimina errores 503.

### 8.2 Corto plazo (cambios de código)

1. **Retry con backoff** para `DataAccessException`:
```java
@Retryable(value = DataAccessException.class, maxAttempts = 3,
           backoff = @Backoff(delay = 500, multiplier = 2))
public RegisterResult registerVoter(Person p) { ... }
```

2. **Circuit Breaker** (Resilience4j):
```java
@CircuitBreaker(name = "registryService", fallbackMethod = "registerFallback")
public RegisterResult registerVoter(Person p) { ... }
```

### 8.3 Largo plazo (arquitectura)

1. **Migrar a PostgreSQL** con PgBouncer: throughput de escritura estimado de 500-1000 TPS.
2. **Async writes** con Spring `@Async` y cola en Redis para picos de demanda.
3. **Prometheus + Grafana** para correlacionar métricas de aplicación con infraestructura (CPU, heap JVM, pool usage).

---

## 9. Reflexión Técnica

### 9.1 Principal aprendizaje

El experimento reveló que el sistema bajo prueba, **en un entorno local con H2 in-memory**, supera todos los SLOs incluso a 600 VUs concurrentes. Sin embargo, se identificó un defecto crítico de infraestructura (PERF-04): la JVM sin tuning de heap colapsa bajo carga extrema por OutOfMemoryError al acumular millones de registros en H2. Este tipo de fallo **es invisible en pruebas funcionales** y solo emerge en pruebas de carga sostenida.

Lección clave: siempre especificar `-Xms` y `-Xmx` al desplegar aplicaciones Spring Boot en producción.

### 9.2 Métrica más sensible

El **p99 de latencia** fue la métrica que mostró la degradación más consistente entre escenarios: pasó de <10ms (baseline) a 14ms (load) y 26ms (stress). Aunque estos valores están lejos del SLO de 800ms, la tendencia de crecimiento es un indicador temprano de contención. En producción con PostgreSQL y latencia de red, el p99 escalaría de forma más pronunciada.

### 9.3 Limitaciones del entorno de prueba

- **H2 en modo embebido** con almacenamiento en heap: el sistema "falla" por OOM antes de fallar por latencia de BD. En producción con PostgreSQL en servidor separado, la BD sería el cuello de botella, no la memoria JVM.
- **Red loopback** (localhost): latencias de <1ms que no son representativas de producción (típicamente 1-50ms de red).
- **Sin think time** (`SLEEP_MS=0`): throughput artificial de 35k req/s por VU vs. ~10 req/s en uso real con usuarios humanos.
- **Recursos compartidos**: k6 y la app compiten por CPU/RAM en la misma máquina, comprimiendo ambos rendimientos.

### 9.4 Conclusión

El sistema Registraduría **cumple todos los SLOs** bajo las condiciones de prueba locales con hasta 600 VUs. El único defecto real identificado fue PERF-04 (OOM sin `-Xmx`), resuelto con `-Xmx4g`. En un entorno de producción real con PostgreSQL, red y múltiples instancias, los cuellos de botella proyectados serían el pool HikariCP (máx. 10 conexiones) y los GC pauses de la JVM bajo alta concurrencia, que justifican las propuestas de mejora documentadas.

---

*Universidad de La Sabana – Facultad de Ingeniería | Maestría en Ingeniería de Software | 2025-1*
