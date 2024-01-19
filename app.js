const express = require("express");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

// JWT Secret Key
const SECRET_KEY = "YOUR_SECRET_KEY";

// Middleware for JWT authentication
const authentication = (request, response, next) => {
  let jwtToken;

  const authHeader = request.headers["authorization"];

  if (authHeader) {
    jwtToken = authHeader.split(" ")[1];
  }

  if (jwtToken) {
    jwt.verify(jwtToken, SECRET_KEY, (error, payload) => {
      if (error) {
        response.status(401).send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        request.userId = payload.userId;
        next();
      }
    });
  } else {
    response.status(401).send("Invalid JWT Token");
  }
};

const getFollowingPeopleIdOfUser = async (username) => {
  // Your implementation here
  const getFollowingPeopleQuery = `
  SELECT following_user_id FROM follower INNER JOIN 
  user ON user.user_id = follower.follower_user_id 
  WHERE username = ?;
`;
  const followingPeople = await db.all(getFollowingPeopleQuery, [username]);

  const arrayOfIds = followingPeople.map(
    (eachUser) => eachUser.following_user_id
  );

  return arrayOfIds;
};

// API 1: User Registration
app.post("/register/", async (request, response) => {
  // Implementation here...
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);

  const getUserQuery = `SELECT * FROM user WHERE username = '${username}';`;

  const userDetails = await db.get(getUserQuery);

  if (userDetails !== undefined) {
    response.status(400);

    response.send("user already exist");
  } else {
    if (password.length < 6) {
      response.status(400);

      response.send("password is too short");
    } else {
      const createUserQuery = `
  INSERT INTO user (username, password, name, gender)
  VALUES(?, ?, ?, ?);
`;

      const getUser = await db.run(createUserQuery, [
        username,
        hashedPassword,
        name,
        gender,
      ]);

      response.send("User Create Successfully");
    }
  }
});

// API 2: User Login
app.post("/login/", async (request, response) => {
  // Implementation here...
  const { username, password } = request.body;

  const getUserQuery = `
 SELECT * FROM user WHERE username = '${username}';
`;

  const getUserDetails = await db.get(getUserQuery);

  if (getUserDetails !== undefined) {
    const isPasswordCorrect = await bcrypt.compare(
      password,

      getUserDetails.password
    );

    if (isPasswordCorrect) {
      const payload = { username, userId: getUserDetails.user_id };

      const jwtToken = jwt.sign(payload, SECRET_KEY);

      response.send({ jwtToken });
    } else {
      response.status(400);

      response.send("Invalid Password");
    }
  } else {
    response.status(400);

    response.send("Invalid User Name");
  }
});

// API 3: Get User's Tweets Feed
app.get("/user/tweets/feed/", authentication, async (request, response) => {
  // Implementation here...
  const { username } = request;

  const followingPeopleIds = await getFollowingPeopleIdOfUser(username);

  const getTweetsQuery = `
 SELECT username, tweet, date_time as dateTime
 FROM user INNER JOIN tweet ON user.user_id = tweet.user_id 
 WHERE user.user_id IN (${followingPeopleIds})
 ORDER BY date_time DESC
 LIMIT 4;
`;

  const tweets = await db.all(getTweetsQuery);

  response.send(tweets);
});

// API 4: Get User's Following List
app.get("/user/following/", authentication, async (request, response) => {
  // Implementation here...
  const { username, userId } = request;

  const getFollowingUsersQuery = `

    SELECT name FROM follower INNER JOIN user ON user.user_id  = follower.following_user_id

    WHERE following_user_id = ${userId};

    `;

  const followingPeople = await db.all(getFollowingUsersQuery);

  response.send(followingPeople);
});

// API 5: Get User's Followers List
app.get("/user/followers/", authentication, async (request, response) => {
  // Implementation here...
  const { username, userId } = request;

  const getFollowersQuery = `

    SELECT DISTINCT name FROM follower INNER JOIN user ON user.user_id = follower.follower_user_id

    WHERE following_user_id = ${userId};`;

  const followers = await db.all(getFollowersQuery);

  response.send(followers);
});

// API 6: Get Tweet by ID
app.get("/tweets/:tweetId/", authentication, async (request, response) => {
  // Implementation here...
  const { username, userId } = request;

  const { tweetId } = request.params;

  const getTweetQuery = `

SELECT tweet ,

(SELECT COUNT() FROM like WHERE tweet_id = ${tweetId}) AS likes ,

(SELECT COUNT() FROM reply WHERE tweet_id = ${tweetId}) AS replies

FROM tweet

WHERE tweet.tweet_id = ${tweetId};`;

  const tweet = await db.get(getTweetQuery);

  response.send(tweet);
});

// API 7: Get Likes for a Tweet
app.get(
  "/tweets/:tweetId/likes/",
  authentication,
  async (request, response) => {
    // Implementation here...
    const { tweetId } = request.params;

    const getLikesQuery = `

    SELECT username FROM user INNER JOIN like ON user.user_id = like.user_id

    WHERE tweet_id = ${tweetId};`;

    const likedUser = await db.all(getLikesQuery);

    const usersArray = likedUser.map((eachUser) => eachUser.username);
    response.send(usersArray);
  }
);

// API 8: Get Replies for a Tweet
app.get(
  "/tweets/:tweetId/replies/",
  authentication,
  async (request, response) => {
    // Implementation here...
    const { tweetId } = request.params;

    const getRepliedQuery = `

    SELECT name, reply FROM user INNER JOIN reply ON user.user_id = reply.user_id

    WHERE tweet_id = ${tweetId};`;

    const repliedUsers = await db.all(getRepliedQuery);

    response.send({ replies: repliedUsers });
  }
);

// API 9: Get User's Tweets
app.get("/user/tweets/", authentication, async (request, response) => {
  // Implementation here...
  const { userId } = request;

  const getTweetsQuery = `
  SELECT tweet,
  COUNT(DISTINCT like_id) AS likes,
  COUNT(DISTINCT reply_id) AS replies,
  date_time AS dateTime
  FROM tweet LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id LEFT JOIN like
  ON tweet.tweet_id = like.tweet_id
  WHERE tweet.user_id = ${userId}
  GROUP BY tweet.tweet_id;
`;

  const tweets = await db.all(getTweetsQuery);

  response.send(tweets);
});

// API 10: Create a Tweet
app.post("/user/tweets/", authentication, async (request, response) => {
  // Implementation here...
  const { tweet } = request.body;

  const userId = parseInt(request.userId);

  const dateTime = new Date().toJSON().substring(0, 19).replace("T", " ");

  const createTweetQuery = `
  INSERT INTO tweet (tweet, user_id, date_time)
  VALUES('${tweet}', ${userId}, '${dateTime}');
`;

  await db.run(createTweetQuery);

  response.send("Created a Tweet");
});

// API 11: Delete a Tweet
app.delete("/tweets/:tweetId/", authentication, async (request, response) => {
  // Implementation here...
  const { tweetId } = request.params;

  const { userId } = request;

  const getTheTweetQuery = `
  SELECT * FROM tweet WHERE user_id = ? AND tweet_id = ?;
`;

  const tweet = await db.get(getTheTweetQuery, [userId, tweetId]);

  console.log(tweet);

  if (tweet === undefined) {
    response.status(401);

    response.send("Invalid Request");
  } else {
    const deleteTweetQuery = `DELETE FROM tweet WHERE tweet_id = ${tweetId};`;

    await db.run(deleteTweetQuery);

    response.send("Tweet Removed");
  }
});

module.exports = app;
