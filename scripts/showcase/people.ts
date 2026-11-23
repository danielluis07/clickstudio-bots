import type { Random } from "@/scripts/showcase/random";

const firstNames = [
  "Ana",
  "Beatriz",
  "Camila",
  "Carolina",
  "Daniela",
  "Fernanda",
  "Gabriela",
  "Helena",
  "Isabela",
  "Juliana",
  "Larissa",
  "Letícia",
  "Luana",
  "Mariana",
  "Natália",
  "Patrícia",
  "Priscila",
  "Renata",
  "Sabrina",
  "Tatiane",
  "Vanessa",
  "Vitória",
  "Aline",
  "Bruna",
  "Cláudia",
  "Eduarda",
  "Jéssica",
  "Lúcia",
  "Marta",
  "Rosana",
  "André",
  "Bruno",
  "Caio",
  "Carlos",
  "Daniel",
  "Diego",
  "Eduardo",
  "Felipe",
  "Gabriel",
  "Gustavo",
  "Henrique",
  "Igor",
  "João",
  "José",
  "Leonardo",
  "Lucas",
  "Marcelo",
  "Mateus",
  "Paulo",
  "Pedro",
  "Rafael",
  "Ricardo",
  "Rodrigo",
  "Thiago",
  "Vinícius",
  "Wagner",
  "Antônio",
  "Fábio",
  "Sérgio",
  "Otávio",
] as const;

const lastNames = [
  "Almeida",
  "Alves",
  "Andrade",
  "Araújo",
  "Barbosa",
  "Barros",
  "Batista",
  "Cardoso",
  "Carvalho",
  "Castro",
  "Cavalcanti",
  "Correia",
  "Costa",
  "Dias",
  "Duarte",
  "Fernandes",
  "Ferreira",
  "Freitas",
  "Gomes",
  "Lima",
  "Lopes",
  "Machado",
  "Marques",
  "Martins",
  "Melo",
  "Mendes",
  "Monteiro",
  "Moraes",
  "Moreira",
  "Nascimento",
  "Nogueira",
  "Oliveira",
  "Pereira",
  "Pinto",
  "Ramos",
  "Reis",
  "Ribeiro",
  "Rocha",
  "Rodrigues",
  "Santana",
  "Santos",
  "Silva",
  "Siqueira",
  "Soares",
  "Souza",
  "Teixeira",
  "Vieira",
  "Xavier",
] as const;

const nicknames: Record<string, string> = {
  Juliana: "Ju",
  Gabriela: "Gabi",
  Carolina: "Carol",
  Isabela: "Bela",
  Fernanda: "Nanda",
  Rafael: "Rafa",
  Eduardo: "Edu",
  Leonardo: "Léo",
  Gustavo: "Guto",
  Natália: "Nati",
  Patrícia: "Paty",
};

const profileEmoji = ["🌻", "✨", "🌸", "💙", "🙏", "⚽", "🌿"] as const;

// Area codes around São Paulo: most Contacts are local.
const areaCodes = [11, 11, 11, 11, 11, 11, 11, 13, 19, 12, 15, 21, 31] as const;

export type Person = {
  firstName: string;
  fullName: string;
  // What WhatsApp sends as the Contact's profile name.
  profileName: string;
  phone: string;
};

export const createPeople = (random: Random) => {
  const usedPhones = new Set<string>();
  // A random number in the little-used 9-0 mobile range. Not checked against
  // real lines: look before publishing a screenshot that shows one.
  // practice, so screenshots never show a real person's number.
  const phone = () => {
    for (;;) {
      const candidate = `55${random.pick(areaCodes)}90${random.digits(7)}`;
      if (!usedPhones.has(candidate)) {
        usedPhones.add(candidate);
        return candidate;
      }
    }
  };

  return (): Person => {
    const firstName = random.pick(firstNames);
    const lastName = random.pick(lastNames);
    const fullName = random.chance(0.3)
      ? `${firstName} ${random.pick(lastNames)} ${lastName}`
      : `${firstName} ${lastName}`;
    const style = random.next();
    const nickname = nicknames[firstName];
    const profileName =
      style < 0.45
        ? `${firstName} ${lastName}`
        : style < 0.65
          ? firstName
          : style < 0.75 && nickname
            ? `${nickname} ${lastName}`
            : style < 0.85
              ? `${firstName} ${lastName[0]}.`
              : `${firstName} ${random.pick(profileEmoji)}`;
    return {
      firstName,
      fullName,
      profileName,
      phone: phone(),
    };
  };
};
