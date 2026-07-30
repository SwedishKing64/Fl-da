// Sample post-purchase replies — the kind of open text merchants collect and then never
// read. Deliberately varied in sentiment and theme so the insight surface has something
// real to chew on.

import type { FeedbackItem } from "@/lib/insights";

export const FEEDBACK: FeedbackItem[] = [
  {
    id: "f1",
    customer: "Hannah M.",
    product: "Linen wrap dress",
    orderRef: "#1043",
    receivedLabel: "2h ago",
    rating: 5,
    text: "Absolutely love this dress — the linen is beautiful and the fit is perfect. So many compliments already, will definitely order again!",
  },
  {
    id: "f2",
    customer: "Darren K.",
    product: "Ceramic pour-over set",
    orderRef: "#1041",
    receivedLabel: "5h ago",
    rating: 2,
    text: "Arrived a week late and the box was crushed — one of the cups was cracked. Disappointed for the price.",
  },
  {
    id: "f3",
    customer: "Priya S.",
    product: "Merino beanie",
    orderRef: "#1039",
    receivedLabel: "yesterday",
    rating: 3,
    text: "Nice quality but runs really small. Had to give it to my daughter. Sizing guide would help.",
  },
  {
    id: "f4",
    customer: "Tom B.",
    product: "Leather weekender bag",
    orderRef: "#1036",
    receivedLabel: "yesterday",
    rating: 5,
    text: "Exceptional. The leather is gorgeous and it feels like it'll last a lifetime. Worth every penny.",
  },
  {
    id: "f5",
    customer: "Aisha R.",
    product: "Ceramic pour-over set",
    orderRef: "#1034",
    receivedLabel: "2 days ago",
    rating: 1,
    text: "Never arrived. I emailed support twice and got no response. Just want a refund at this point.",
  },
  {
    id: "f6",
    customer: "Leo F.",
    product: "Merino beanie",
    orderRef: "#1031",
    receivedLabel: "2 days ago",
    rating: 2,
    text: "The wool started pilling after one wear and it also came up small. Not great quality for the money.",
  },
  {
    id: "f7",
    customer: "Sofia G.",
    product: "Linen wrap dress",
    orderRef: "#1029",
    receivedLabel: "3 days ago",
    rating: 4,
    text: "Really lovely dress and fast shipping. Took off one star only because the colour was a touch lighter than the photo.",
  },
  {
    id: "f8",
    customer: "Marcus T.",
    product: "Leather weekender bag",
    orderRef: "#1025",
    receivedLabel: "3 days ago",
    rating: 5,
    text: "Best bag I've owned. Beautiful stitching, perfect size for a weekend away. Obsessed.",
  },
];
