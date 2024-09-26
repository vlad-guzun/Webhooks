import { NextApiRequest, NextApiResponse } from "next";
import { getAuth } from "@clerk/nextjs/server";
import { pusherServer } from "@/lib/pusher";







//just semples!!!! dependencies are not installed, this are just some examples meant just to be seen
//IMPLEMENTATION OF PRESENCE IN THE APP, WHEN THE USER LOGS IN THE APP, IT WILL SHOW THAT HE IS ONLINE


export default async function handler (req: NextApiRequest, res: NextApiResponse) {
  
    const {userId}  = getAuth(req);
  
      if (!userId) {
        return res.status(401);
      }

      const { channel_name, socket_id } = req.body;

      const presenceData = {user_id: userId};

      const authResponse = pusherServer.authorizeChannel(socket_id,channel_name,presenceData);
      console.log(authResponse);
      return res.send(authResponse);
};


//USE OF STORE 
import {create} from 'zustand';

interface UserState {
  selectedUser: User_with_interests_location_reason | null;
  setSelectedUser: (user: User_with_interests_location_reason | null) => void;
}

export const useUserStore = create<UserState>((set) => ({
  selectedUser: null,
  setSelectedUser: (user) => set({ selectedUser: user }),
}));



//IMPLEMENTATION OF A LIBRARY THAT WILL LET ME UPLOAD MULTIMEDIA ON CLOUD AND MAKE SOME PROCESSING ON IT
import { NextRequest, NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { reels } = body;

    if (!reels || !Array.isArray(reels) || reels.length === 0) {
      return NextResponse.json({ status: 'error', message: 'Reels array is required' }, { status: 400 });
    }

    const screenshotsData = await Promise.all(reels.map(async (reel: { url: string, video_id: string }) => {
      const videoUrl = reel.url;
      const uploadResponse = await cloudinary.uploader.upload(videoUrl, {
        resource_type: 'video',
        folder: 'sample_folder'
      });

      const maxDuration = 5;
      const times = Array.from({ length: maxDuration }, (_, i) => i + 1);

      const screenshots = times.map(time => cloudinary.url(uploadResponse.public_id, {
        resource_type: 'video',
        format: "jpg",
        transformation: [
          { width: 200, height: 400, crop: 'fill' },
          { start_offset: `${time}s`, duration: 0.1 }
        ]
      }));
      return { videoId: reel.video_id, screenshots };
    }));

    return NextResponse.json({ status: 'success', data: screenshotsData });
  } catch (error) {
    console.error('Error generating screenshots:', error);
    return NextResponse.json({ status: 'error', message: error }, { status: 500 });
  }
}





//WEBHOOK IMPLEMENTATION TO LOG IN INSTANTLY A USER THOUGH AN AUTH PROVIDER(GOOGLE, FACEBOOK, ETC)
/* eslint-disable camelcase */
import { clerkClient } from "@clerk/nextjs/server";
import { WebhookEvent } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Webhook } from "svix";

import { createUser, deleteUser, updateUser } from "@/lib/actions/user.action";

export async function POST(req: Request) {
  // You can find this in the Clerk Dashboard -> Webhooks -> choose the webhook
  const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    throw new Error(
      "Please add WEBHOOK_SECRET from Clerk Dashboard to .env or .env.local"
    );
  }

  // Get the headers
  const headerPayload = headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  // If there are no headers, error out
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response("Error occured -- no svix headers", {
      status: 400,
    });
  }

  // Get the body
  const payload = await req.json();
  const body = JSON.stringify(payload);

  // Create a new Svix instance with your secret.
  const wh = new Webhook(WEBHOOK_SECRET);

  let evt: WebhookEvent;

  // Verify the payload with the headers
  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error("Error verifying webhook:", err);
    return new Response("Error occured", {
      status: 400,
    });
  }

  // Get the ID and type
  const { id } = evt.data;
  const eventType = evt.type;

  // CREATE
  if (eventType === "user.created") {
    const { id, email_addresses, image_url, first_name, last_name, username } = evt.data;

    const user = {
      clerkId: id,
      email: email_addresses[0].email_address,
      username: username!,
      firstName: first_name as string,
      lastName: last_name as string,
      photo: image_url,
    };

    const newUser = await createUser(user);

    // Set public metadata
    if (newUser) {
      await clerkClient.users.updateUserMetadata(id, {
        publicMetadata: {
          userId: newUser._id,
        },
      });
    }

    return NextResponse.json({ message: "OK", user: newUser });
  }

  // UPDATE
  if (eventType === "user.updated") {
    const { id, image_url, first_name, last_name, username } = evt.data;

    const user = {
      firstName: first_name as string,
      lastName: last_name as string,
      username: username!,
      photo: image_url,
    };

    const updatedUser = await updateUser(id, user);

    return NextResponse.json({ message: "OK", user: updatedUser });
  }

  // DELETE
  if (eventType === "user.deleted") {
    const { id } = evt.data;

    const deletedUser = await deleteUser(id!);

    return NextResponse.json({ message: "OK", user: deletedUser });
  }

  console.log(`Webhook with and ID of ${id} and type of ${eventType}`);
  console.log("Webhook body:", body);

  return new Response("", { status: 200 });
}



//USE OF MONGODB TO STORE DATA AND MAKE MACHINE LEARNING REQUESTS
"use server";

import { MongoClient } from "mongodb";
import FullUser from "../database/models/fullUser.model";
import { connectToDatabase } from "../database/connectToDatabase";

export async function findSimilarPeople( embedding: Number[]) {
    
    const uri = process.env.MONGODB_URL as string;
    const client = new MongoClient(uri);
    await client.connect();

    const db = client.db("dl");
    const collection = db.collection("embeddedusers");

    const similarDocs = await collection.aggregate([
        {
            $vectorSearch: {
                queryVector: embedding,
                path: "embeddedInterests",
                numCandidates: 6,
                limit: 6,
                index: "default"
            },
        },
        {
            $project: {
                clerkId: 1,
                _id: 0
            }
        }
    ]).toArray();

    await connectToDatabase(); 
    const found_people = await FullUser.find({ clerkId: { $in: similarDocs.map(doc => doc.clerkId) } });
    return JSON.parse(JSON.stringify(found_people));
    
    
}


//MACHINE LEARNING REQUEST TO FIND SIMILARITY BETWEEN VIDEOS
export async function generate_similar_reels( embedding: Number[]) {
    
    const uri = process.env.MONGODB_URL as string;
    const client = new MongoClient(uri);
    await client.connect();

    const db = client.db("dl");
    const collection = db.collection("fulluserhelpers");

    const similarDocs = await collection.aggregate([
        {
            $vectorSearch: {
                queryVector: embedding,
                path: "embedded_video",
                numCandidates: 6,
                limit: 3,
                index: "helper"
            },
        },
        {
            $project: {
                videoId: 1,
                _id: 0
            }
        }
    ]).toArray();

    return JSON.parse(JSON.stringify(similarDocs));
}

