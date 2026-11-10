/**
 * Où vivent les captures envoyées pour la réduction du road trip (lot 5b),
 * toujours en privé, jamais à une adresse publique :
 *
 *  - dans un magasin Vercel Blob **privé** quand BLOB_PREUVES_READ_WRITE_TOKEN
 *    est réglé : un magasin créé en accès privé, à part de celui des photos
 *    des vélos. Chaque lecture passe par le serveur, avec la clé ;
 *  - sinon dans la base elle-même (table FichierPreuve), à côté de la preuve,
 *    dans la même transaction : aucune adresse n'existe pour le fichier.
 *
 * Pourquoi la base par défaut : le magasin Vercel Blob du site sert les
 * photos des vélos en accès public, et l'accès privé (que la version
 * installée de @vercel/blob sait demander) se règle à la création d'un
 * magasin, ce qui ne se vérifie pas d'ici. La base, elle, est privée par
 * construction (protection RLS, seul le serveur y lit) et les captures y
 * restent peu de temps : effacées dès la décision, 30 jours au plus tard.
 *
 * La clé rangée avec la preuve dit où est son fichier (« blob:… » ou
 * « base:… ») : un changement de réglage n'égare aucune capture déjà reçue.
 */

import { PREFIXE_FICHIER_EN_BASE, type Depot } from "@/lib/db/contrat";
import type { PreuveReduction } from "@/lib/types";

/** La clé d'un fichier rangé dans le magasin privé : « blob:<chemin> ». */
export const PREFIXE_FICHIER_BLOB = "blob:";

/** Ce que le stockage demande à Vercel Blob : ranger, lire et effacer, en accès privé. */
export interface ClientBlob {
  put(
    pathname: string,
    body: Buffer,
    options: { access: "private"; token: string; contentType: string; addRandomSuffix: boolean },
  ): Promise<{ pathname: string }>;
  get(
    pathname: string,
    options: { access: "private"; token: string; useCache: boolean },
  ): Promise<{ statusCode: number; stream: ReadableStream<Uint8Array> | null } | null>;
  del(pathname: string, options: { token: string }): Promise<void>;
}

export interface StockagePreuves {
  /** « blob » : le fichier va dans le magasin privé ; « base » : avec sa preuve, dans la base. */
  mode: "blob" | "base";
  /** Range un fichier dans le magasin privé et rend sa clé (« blob:… »). En mode « blob » seulement. */
  ranger(octets: Uint8Array, typeMime: string): Promise<string>;
  /** Le fichier d'une preuve, où qu'il soit rangé ; `null` s'il n'existe plus. */
  lire(preuve: Pick<PreuveReduction, "id" | "fichierCle">): Promise<Uint8Array | null>;
  /**
   * Efface le fichier rangé dans le magasin privé. Celui de la base part avec
   * `effacerFichierPreuve`, que l'appelant fait ensuite dans tous les cas.
   */
  effacer(preuve: Pick<PreuveReduction, "id" | "fichierCle">): Promise<void>;
}

/** Le jeton du magasin privé des captures, s'il est réglé. */
export function jetonBlobPreuves(): string | null {
  return process.env.BLOB_PREUVES_READ_WRITE_TOKEN?.trim() || null;
}

/** Vercel Blob, chargé seulement quand le magasin privé sert. */
async function clientBlobParDefaut(): Promise<ClientBlob> {
  const blob = await import("@vercel/blob");
  return {
    put: (pathname, body, options) => blob.put(pathname, body, options),
    get: (pathname, options) => blob.get(pathname, options),
    del: (pathname, options) => blob.del(pathname, options),
  };
}

export function stockagePreuves(options: {
  depot: Pick<Depot, "lireFichierPreuve">;
  /** Le jeton du magasin privé ; par défaut, celui de l'environnement. `null` : la base. */
  jeton?: string | null;
  blob?: () => Promise<ClientBlob>;
}): StockagePreuves {
  const jeton = options.jeton === undefined ? jetonBlobPreuves() : options.jeton;
  const client = options.blob ?? clientBlobParDefaut;
  const exigerJeton = (): string => {
    if (!jeton) throw new Error("BLOB_PREUVES_READ_WRITE_TOKEN absent : le magasin privé des captures n'est pas joignable.");
    return jeton;
  };
  const chemin = (cle: string) => cle.slice(PREFIXE_FICHIER_BLOB.length);

  return {
    mode: jeton ? "blob" : "base",

    async ranger(octets, typeMime) {
      const extension = typeMime === "image/webp" ? "webp" : typeMime === "image/png" ? "png" : "jpg";
      // Un nom sans rien du client, rendu unique par Vercel Blob.
      const range = await (await client()).put(`preuves/capture.${extension}`, Buffer.from(octets), {
        access: "private",
        token: exigerJeton(),
        contentType: typeMime,
        addRandomSuffix: true,
      });
      return `${PREFIXE_FICHIER_BLOB}${range.pathname}`;
    },

    async lire(preuve) {
      const cle = preuve.fichierCle;
      if (!cle) return null;
      if (cle.startsWith(PREFIXE_FICHIER_EN_BASE)) return options.depot.lireFichierPreuve(preuve.id);
      if (!cle.startsWith(PREFIXE_FICHIER_BLOB)) return null;
      const lu = await (await client()).get(chemin(cle), { access: "private", token: exigerJeton(), useCache: false });
      if (!lu || lu.statusCode !== 200 || !lu.stream) return null;
      return new Uint8Array(await new Response(lu.stream).arrayBuffer());
    },

    async effacer(preuve) {
      const cle = preuve.fichierCle;
      if (!cle?.startsWith(PREFIXE_FICHIER_BLOB)) return;
      await (await client()).del(chemin(cle), { token: exigerJeton() });
    },
  };
}
