/**
 * The emoji the chat offers (Oct 2026): the common ones, by group, each with
 * words to find it by. Plain data, no package: the picker and the reactions.
 */

/** Quick reactions, one tap from a message. */
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

const g = (name, list) => ({ name, emoji: list.trim().split("\n").map((l) => { const [e, ...w] = l.trim().split(" "); return { e, w: w.join(" ") }; }) });

export const EMOJI_GROUPS = [
  g("Smileys", `
😀 grin smile happy
😃 smile happy joy
😄 smile laugh happy
😁 grin beam
😆 laugh lol
😅 sweat relief laugh
🤣 rofl rolling laugh
😂 joy tears laugh lol
🙂 slight smile
🙃 upside down silly
😉 wink
😊 blush smile
😇 angel innocent halo
🥰 love hearts adore
😍 heart eyes love
🤩 star struck wow
😘 kiss blow
😋 yum tasty
😛 tongue
😜 wink tongue crazy
🤪 zany crazy
🤗 hug
🤭 oops giggle
🤫 shh quiet
🤔 thinking hmm
🤐 zipper quiet
🤨 raised eyebrow skeptical
😐 neutral meh
😑 expressionless
😶 no mouth speechless
😏 smirk
😒 unamused
🙄 eye roll
😬 grimace awkward
😌 relieved calm
😔 pensive sad
😪 sleepy
😴 sleeping tired zzz
😷 mask sick
🤒 sick fever
🤕 hurt injured
🤢 nauseated sick
🤧 sneeze cold
🥵 hot heat
🥶 cold freezing
😵 dizzy
🤯 mind blown exploding
🤠 cowboy
🥳 party celebrate birthday
😎 cool sunglasses
🤓 nerd geek
🧐 monocle curious
😕 confused
😟 worried
🙁 frown sad
😮 wow surprised open mouth
😯 hushed surprised
😲 astonished shocked
😳 flushed embarrassed
🥺 pleading puppy eyes please
😦 frowning
😧 anguished
😨 fearful scared
😰 anxious sweat
😥 sad relieved
😢 cry sad tear
😭 sob crying
😱 scream fear
😖 confounded
😣 persevere
😞 disappointed
😓 downcast sweat
😩 weary tired
😫 tired exhausted
🥱 yawn bored
😤 triumph huff
😡 angry rage mad
😠 angry mad
🤬 cursing swearing
😈 devil smiling
💀 skull dead
💩 poop
🤡 clown
👻 ghost
👽 alien
🤖 robot
`),
  g("Gestures", `
👍 thumbs up yes like ok good
👎 thumbs down no dislike
👌 ok perfect
🤌 pinched fingers
✌️ peace victory
🤞 fingers crossed luck hope
🤟 love you
🤘 rock on
🤙 call me
👈 point left
👉 point right
👆 point up
👇 point down
☝️ index up one
✋ raised hand stop high five
🤚 back of hand
🖐️ hand fingers
🖖 vulcan
👋 wave hello hi bye
👏 clap applause bravo
🙌 raised hands celebrate hooray
👐 open hands
🤲 palms up
🤝 handshake deal agree
🙏 pray please thanks thank you
✍️ writing
💪 strong muscle flex
🫡 salute
🫶 heart hands
👀 eyes look see
🧠 brain smart
🙋 raise hand question
🤷 shrug dunno
🤦 facepalm
🙇 bow sorry
💁 info sassy
🙅 no
🙆 ok yes
🏃 run running
🚶 walk
💃 dance
🕺 dance
👯 party dancing
`),
  g("Hearts", `
❤️ heart love red
🧡 orange heart
💛 yellow heart
💚 green heart
💙 blue heart
💜 purple heart
🖤 black heart
🤍 white heart
🤎 brown heart
💔 broken heart
❣️ heart exclamation
💕 two hearts love
💞 revolving hearts
💓 beating heart
💗 growing heart
💖 sparkling heart
💘 cupid heart arrow
💝 heart gift
💯 hundred 100 perfect
💢 anger
💥 boom collision
💫 dizzy star
💦 sweat drops
💨 dash fast
💬 speech chat message
💭 thought
💤 sleep zzz
✅ check done yes
☑️ checkbox done
✔️ check mark
❌ cross no wrong
❗ exclamation important
❓ question
⚠️ warning caution
🚫 prohibited no
⭐ star
🌟 glowing star
✨ sparkles shiny new
🔥 fire hot lit
🎉 party popper celebrate tada congrats
🎊 confetti celebrate
🏆 trophy win champion
🥇 gold medal first
🎯 target goal bullseye
🚀 rocket launch fast
📈 chart up growth
📉 chart down
💰 money bag
💵 dollar money cash
💸 money flying
🔔 bell notification
📣 megaphone announce
📌 pin
`),
  g("Nature & food", `
☀️ sun sunny
🌤️ sun cloud
☁️ cloud
🌧️ rain
⛈️ storm thunder
❄️ snow snowflake cold
🌈 rainbow
🌊 wave ocean
🌵 cactus desert arizona
🌴 palm tree
🌲 tree evergreen
🍀 clover luck
🌸 blossom flower
🌻 sunflower
🌹 rose
🐶 dog puppy
🐱 cat kitty
🐻 bear
🦁 lion
🐯 tiger
🐴 horse
🦄 unicorn
🐝 bee
🦋 butterfly
🐢 turtle slow
🐍 snake
🦅 eagle
🦉 owl
☕ coffee
🍵 tea
🍺 beer
🍻 cheers beers
🥂 cheers champagne toast
🍷 wine
🍕 pizza
🍔 burger
🌮 taco
🌯 burrito
🍟 fries
🍩 donut
🍪 cookie
🎂 birthday cake
🍰 cake
🍎 apple
🍌 banana
🍓 strawberry
🥑 avocado
🌶️ pepper hot spicy
`),
  g("Activities & travel", `
⚽ soccer football
🏀 basketball
🏈 football
⚾ baseball
🎾 tennis
⛳ golf
🎳 bowling
🎮 game video
🎲 dice
🎵 music note
🎶 music notes
🎤 microphone sing
🎧 headphones
🎬 movie clapper
📷 camera photo
🎁 gift present
🎈 balloon
🎄 christmas tree
🎃 pumpkin halloween
🚗 car drive
🚚 truck delivery
✈️ plane flight travel
🏠 house home
🏢 office building
🏗️ construction
🏖️ beach vacation
⛰️ mountain
🗺️ map
⏰ alarm clock
⌛ hourglass time
📅 calendar date
🗓️ calendar
`),
  g("Objects", `
📞 phone call
☎️ telephone
📱 mobile phone
💻 laptop computer
🖥️ desktop computer
⌨️ keyboard
🖨️ printer
📧 email
✉️ envelope letter
📨 incoming envelope
📝 memo note write
📄 page document
📋 clipboard
📁 folder
📊 bar chart
🔍 search magnifying glass
🔑 key
🔒 lock locked
🔓 unlocked
💡 idea light bulb
🔧 wrench fix tool
🔨 hammer
⚙️ gear settings
🧾 receipt
💳 credit card
🏦 bank
⚖️ scales law
🩺 stethoscope health
💊 pill
🛡️ shield insurance protect
☂️ umbrella insurance
🚑 ambulance
🚒 fire engine
🧯 extinguisher
🔋 battery
🕐 clock time
`),
];

/** Every emoji, for finding by a word. */
export const ALL_EMOJI = EMOJI_GROUPS.flatMap((grp) => grp.emoji);

/** The emoji whose words start with (or contain) what is typed. */
export function findEmoji(q, limit = 48) {
  const words = String(q ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return ALL_EMOJI.filter((x) => words.every((w) => x.w.split(" ").some((k) => k.startsWith(w)) || x.w.includes(w))).slice(0, limit);
}

/** Whether a message is only emoji (one to three), to show large as other apps do. */
export function onlyEmoji(text) {
  const t = String(text ?? "").trim();
  if (!t || t.length > 24) return false;
  return /^(\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|\s)+$/u.test(t) && [...t.replace(/\s/g, "")].filter((c) => /\p{Extended_Pictographic}/u.test(c)).length <= 3;
}
