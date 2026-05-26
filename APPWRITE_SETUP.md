# Appwrite Setup pro Surviv.io

## 1. Vytvoř databázi

V Appwrite konzoli → **Databases** → **Create database**

| Pole | Hodnota |
|------|---------|
| Name | `surviv` |
| Database ID | `surviv` |

---

## 2. Vytvoř kolekci

V databázi `surviv` → **Create collection**

| Pole | Hodnota |
|------|---------|
| Name | `players` |
| Collection ID | `players` |

---

## 3. Přidej atributy do kolekce `players`

V kolekci → záložka **Attributes** → **Create attribute**

| Attribute ID   | Typ     | Size  | Required | Default |
|----------------|---------|-------|----------|---------|
| `name`         | String  | 50    | ✅ Yes   | –       |
| `x`            | Float   | –     | ✅ Yes   | `0`     |
| `y`            | Float   | –     | ✅ Yes   | `0`     |
| `angle`        | Float   | –     | ✅ Yes   | `0`     |
| `hp`           | Float   | –     | ✅ Yes   | `100`   |
| `color`        | String  | 10    | ✅ Yes   | –       |
| `kills`        | Integer | –     | ✅ Yes   | `0`     |
| `currentWeapon`| String  | 20    | ✅ Yes   | `fists` |
| `activeBullets`| String  | 10000 | ✅ Yes   | `[]`    |
| `lastUpdate`   | Integer | –     | ✅ Yes   | `0`     |
| `killedBy`     | String  | 100   | ❌ No    | –       |

---

## 4. Nastav oprávnění kolekce

V kolekci → záložka **Settings** → **Permissions**

Přidej tato oprávnění:

| Role | Read | Create | Update | Delete |
|------|------|--------|--------|--------|
| Any  | ✅   | ✅     | ✅     | ✅     |

*(Hra je veřejná, bezpečnost lze zpřísnit later přes document-level permissions)*

---

## 5. Přidej index pro filtrování aktivních hráčů

V kolekci → záložka **Indexes** → **Create index**

| Pole | Hodnota |
|------|---------|
| Index ID | `lastUpdate_index` |
| Type | `Key` |
| Attribute | `lastUpdate` |
| Order | `DESC` |

---

## 6. Povol Realtime

Appwrite Realtime je zapnutý automaticky. Ověř, že v **Settings** projektu je Realtime povoleno.

---

## 7. Nastav CORS (Web Platform)

V Appwrite konzoli → projekt **surviv** → **Settings** → **Platforms** → **Add Platform** → **Web**

| Pole | Hodnota |
|------|---------|
| Name | `surviv-web` |
| Hostname | `surviv.propoj.app` |

> ⚠️ Bez tohoto kroku bude prohlížeč blokovat requesty kvůli CORS!

---

## 8. Deploy na server

```bash
# Na tvém serveru, v adresáři /home/jakub/github/surviv
git pull   # nebo zkopíruj soubory

docker compose up -d --build
```

---

## Ověření

1. Otevři `https://surviv.propoj.app` – měl by se načíst lobby
2. Otevři ve druhé záložce – oba hráči se zobrazí v lobby listu
3. Vstup do hry z obou záložek – hráči se navzájem uvidí na mapě
