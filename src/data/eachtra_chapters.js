// The hero's journey — chapters of the Eachtra, told through the wood of the sluagh.
// Each is introduced Doom-style with a card of Celtic story, then played, then
// closed with an outro beat. Enemy counts escalate toward the final stand.
export const CHAPTERS = [
  {
    n: 1, title: 'An Glaoch', titleEn: 'The Call', enemies: 3, boss: 'giant',
    intro: 'A keening rides the night wind — the caoineadh of the unburied dead. The sluagh, the restless host, sweep low over the wood to bear off any soul left wandering. You are no one yet: a wanderer with a borrowed spear. But the cry will not let you sleep. You take up iron and step beneath the trees — and something older than the host stirs beneath the roots.',
    outro: 'The giant is felled, the host laid to rest. High in the branches a single raven watches, unblinking — and does not fly.',
  },
  {
    n: 2, title: 'Coill na Marbh', titleEn: 'The Wood of the Dead', gauntlet: true, waves: [4, 5, 6], gold: 70,
    intro: 'Deeper now, where the mist never lifts and the trees remember older names. The host comes on in waves, thicker with each, and there is no pause between them. But the dead of this wood were buried with their gold — cut through the whole host and the hoard is yours to carry home.',
    outro: 'You cut a path through the dead, the hoard heavy at your belt, and stand breathing in the cold. The raven keeps pace, bough to bough.',
  },
  {
    n: 3, title: 'Guth na Badhbh', titleEn: 'The Voice of the Badhbh', enemies: 4, morrigan: true,
    intro: 'The raven alights, and is a raven no longer. An Mhórrígan — Badhbh, washer at the ford, phantom queen of war — speaks your name as though she has always known it. "Prove the iron in you," she says, "and I will mark you." The host answers her like hounds loosed.',
    outro: '"You will do," says the Badhbh, and lays a cold finger to your brow. The mark will not wash away. You are a champion now, for good or ill.',
  },
  {
    n: 4, title: 'Trá Thír na nÓg', titleEn: 'The Strand of Tír na nÓg', beach: true, enemies: 6,
    intro: 'The Badhbh\'s mark carries you west over the ninth wave, to the strand of Tír na nÓg — the Land of the Young, where no one grows old. But its shore is not undefended. As your curragh grounds on the bright sand, a warband of imperial men-at-arms and Fomhórach brutes pours down the strand to throw you back into the sea. Hold the beach, and win your footing in the Otherworld.',
    outro: 'The last of the shore-guard falls, and the strand lies quiet under an endless summer sky. You stand on Tír na nÓg — but the Land of the Young keeps its own, and the way back runs deeper still.',
  },
  {
    n: 5, title: 'Tír na Marbh', titleEn: 'The Land of the Dead', dungeon: true, enemies: 9,
    intro: 'You rode back from Tír na nÓg on a white horse, warned never to touch the soil of Ériu. But you stooped to help a man, the girth broke, and you fell — and three hundred years fell on you in a breath. Aged, withered, you met Pádraig at the roadside and died there in the dust. You refuse it. Down you go, into Tír na Marbh where the old wars are fought forever, maze upon maze of the war-dead — and at the heart of it, the gods themselves keep your soul. Cut your way to their hall, beat a god in the house of the dead, and win back your soul and the years that were taken.',
    outro: 'The Dagda yields, the cauldron gives back what death stole, and you rise through the storm-dark into a living dawn. You are no longer an old man dead in the dust of a changed Ériu — you are a hero, whole and young, your name set beyond the reach of years. The Eachtra is run.',
  },
];
