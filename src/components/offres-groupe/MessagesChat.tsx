import type { MessageChat } from "@/lib/offres-groupe/conversation";
import { heureDuMessage, jourDuMessage, memeJourAuBenin } from "@/lib/offres-groupe/heure-chat";
import { insecables } from "@/lib/offres-groupe/textes-chat";

/** La pastille du jour, au-dessus des bulles. */
const PASTILLE_JOUR =
  "rounded-full bg-white/90 px-3 py-1 text-[0.72rem] font-semibold text-gris-cadre shadow-[0_1px_0.5px_rgba(14,14,14,0.12)]";

/**
 * Le jour de la discussion (« Aujourd'hui »), collé en haut de la zone qui
 * défile, comme sur un téléphone : il reste visible quand on remonte ou
 * descend dans les bulles. Décoratif pour les lecteurs d'écran.
 */
export function JourDeLaDiscussion({ messages, maintenant }: { messages: MessageChat[]; maintenant: number }) {
  return (
    <div aria-hidden="true" className="pointer-events-none sticky top-0 z-10 -mt-1 mb-2 flex justify-center">
      <span className={PASTILLE_JOUR}>{jourDuMessage(messages[0]?.a, maintenant)}</span>
    </div>
  );
}

/**
 * Les bulles de la discussion, comme sur un téléphone : Bike Land à gauche
 * en blanc, le client à droite en orange, l'heure dans chaque bulle. Les
 * bulles qui se suivent du même côté forment un groupe : plus serrées, la
 * pointe sur la dernière seulement. Une discussion qui passe minuit montre
 * le nouveau jour entre ses bulles.
 *
 * Le texte sur l'orange est noir (5,8:1) : le blanc n'y tiendrait pas le
 * contraste AA. Rien n'est calculé ici, tout vient de la machine.
 */
export function FilMessages({ messages, maintenant }: { messages: MessageChat[]; maintenant: number }) {
  return (
    <ol className="flex flex-col">
      {messages.map((message, rang) => {
        const avant = messages[rang - 1];
        const apres = messages[rang + 1];
        const nouveauJour = Boolean(avant) && !memeJourAuBenin(avant.a, message.a);
        const premier = !avant || nouveauJour || avant.de !== message.de;
        const dernier = !apres || apres.de !== message.de || !memeJourAuBenin(message.a, apres.a);
        return (
          <li key={message.id} data-bulle className={`flex flex-col ${rang === 0 ? "" : premier ? "mt-3" : "mt-1"}`}>
            {nouveauJour && (
              <span aria-hidden="true" className={`mb-3 mt-1 self-center ${PASTILLE_JOUR}`}>
                {jourDuMessage(message.a, maintenant)}
              </span>
            )}
            <Bulle message={message} premier={premier} dernier={dernier} />
          </li>
        );
      })}
    </ol>
  );
}

/** L'ombre très fine des bulles : un trait, pas une ombre portée. */
const TRAIT = "shadow-[0_1px_0.5px_rgba(14,14,14,0.13)]";

function Bulle({ message, premier, dernier }: { message: MessageChat; premier: boolean; dernier: boolean }) {
  const client = message.de === "client";
  const heure = heureDuMessage(message.a);
  const points = message.points?.length ? message.points : null;
  // Les coins du côté de la bulle se resserrent dans un groupe ; la dernière porte la pointe.
  const coins = client
    ? `${premier ? "" : "rounded-tr-md"} ${dernier ? "rounded-br-none" : "rounded-br-md"}`
    : `${premier ? "" : "rounded-tl-md"} ${dernier ? "rounded-bl-none" : "rounded-bl-md"}`;
  const ton = !client && message.ton ? message.ton : null;
  return (
    <div
      className={`relative max-w-[85%] rounded-2xl ${coins} pb-1.5 pr-3 pt-2 text-[0.92rem] leading-snug text-noir-piste ${TRAIT} ${
        client ? "self-end bg-orange-signal" : "self-start bg-white"
      } ${ton ? "pl-4" : "pl-3"} ${points ? "w-full" : ""}`}
    >
      <span className="sr-only">{client ? "Vous : " : "Bike Land : "}</span>
      {ton && (
        <span
          aria-hidden="true"
          className={`absolute bottom-2 left-1.5 top-2 w-1 rounded-full ${ton === "alerte" ? "bg-orange-signal" : "bg-vert-lagune"}`}
        />
      )}
      <span className="whitespace-pre-line [overflow-wrap:anywhere]">{insecables(message.texte)}</span>
      {points && (
        <ul className="mt-2 space-y-1.5">
          {points.map((point) => (
            <li key={point.titre} className="rounded-xl bg-craie/80 px-3 py-2">
              <span className="block font-display text-[1rem] font-semibold leading-tight">{point.titre}</span>
              <span className="mt-0.5 block text-[0.84rem] leading-snug text-noir-piste/80">{insecables(point.texte)}</span>
            </li>
          ))}
        </ul>
      )}
      {heure && !points && (
        // La place de l'heure au bout de la dernière ligne : le texte ne passe jamais dessous.
        <span aria-hidden="true" className={`inline-block ${client ? "w-[3.6rem]" : "w-[2.7rem]"}`} />
      )}
      {heure && (
        <span
          aria-hidden="true"
          className={`whitespace-nowrap text-[0.68rem] leading-none tabular-nums ${client ? "text-noir-piste/80" : "text-gris-cadre"} ${
            points ? "mt-1.5 block text-right" : "absolute bottom-1.5 right-2.5"
          }`}
        >
          {heure}
          {client && <span className="ml-1 tracking-[-0.3em]">✓✓</span>}
        </span>
      )}
      {dernier && <Pointe cote={client ? "droite" : "gauche"} />}
    </div>
  );
}

/** La pointe d'une bulle, au coin du bas, du côté de qui parle. */
function Pointe({ cote }: { cote: "gauche" | "droite" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 8 13"
      width="8"
      height="13"
      className={`absolute bottom-0 ${cote === "gauche" ? "-left-[7px] fill-white" : "-right-[7px] -scale-x-100 fill-orange-signal"}`}
    >
      <path d="M8 0v13H0c4.4-1.2 8-5.4 8-13Z" />
    </svg>
  );
}

/**
 * « Bike Land écrit… » : trois petits points dans une bulle, le temps qu'une
 * réponse arrive du serveur. Le texte est lu par les lecteurs d'écran (la
 * zone qui le porte a le rôle « status ») ; les points restent immobiles si
 * le système demande moins de mouvement.
 */
export function BulleEcrit() {
  return (
    <div className="mt-3 flex">
      <div className={`relative rounded-2xl rounded-bl-none bg-white px-4 py-3 ${TRAIT}`}>
        <span className="sr-only">Bike Land écrit…</span>
        <span aria-hidden="true" className="flex items-center gap-1">
          {[0, 1, 2].map((rang) => (
            <span key={rang} className="point-ecriture h-2 w-2 rounded-full bg-noir-piste/50" style={{ animationDelay: `${rang * 160}ms` }} />
          ))}
        </span>
        <Pointe cote="gauche" />
      </div>
    </div>
  );
}
