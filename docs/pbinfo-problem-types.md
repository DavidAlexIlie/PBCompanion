# Catalog tipuri de probleme pbinfo.ro

Generat: 2026-10-13T18:03:25.195Z
ID-uri scanate: 5200 · probleme existente: 4212 · inexistente/șterse: 988

## Distribuție pe tip (din 4212 probleme reale)
| Tip | Număr | % |
|---|---|---|
| file | 2299 | 54.6% |
| console | 1588 | 37.7% |
| subprogram | 175 | 4.2% |
| class | 150 | 3.6% |

## Intrare/ieșire
| IO | Număr | % |
|---|---|---|
| file | 2437 | 57.9% |
| console | 1775 | 42.1% |

Limbaje: 373 doar C++ · 3839 mai multe limbaje.

## Exemple reale
- **Consolă:** #2 suma_n, #9 maxmin, #10 Suma Cifrelor, #11 Vocale, #12 Initiale, #13 Prefixe
- **Fișiere:** #1 sum, #7 maxim2, #8 maxim3, #18 Numarul de divizori, #19 BFS, #57 n_Suma
- **Subprogram:** #16 Suma divizorilor, #17 Suma divizorilor 2, #20 Suma divizorilor primi, #21 Suma cifrelor, #23 Oglindit1, #24 Oglindit2
- **Clasă/OOP:** #91 Masini, #92 Proiecte, #341 Bomboane, #353 Spectacole, #384 Saritura_Calului1, #398 Plopi2

## Reguli de detecție (prima potrivire câștigă)
1. **subprogram** — `(defini[tț]ia( completă)? a? ?subprogramului|numele subprogramului cerut|parametrii sunt,? în această ordine|va conține doar defini[tț]ia|scrieți (definiția|subprogramul))` (pe text normalizat fără diacritice; prima regulă)
2. **class** — `(defini[tț]i clasa|definiția clasei|metoda |metodele |constructor|programare orientată)` (a doua)
3. **file** — celula Intrare/ieșire din tabelul info conține x.in/x.out (sau enunțul) 
4. **console** — altfel (tastatură/ecran) 
